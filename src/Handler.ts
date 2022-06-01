import { PayloadGenerator, Mode } from "./PayloadGenerator";
import * as readline from 'readline';
import { Requester } from "./Requester";
import * as yargs from 'yargs';
import { HTTPParser } from "./HTTPParser";
import * as fs from 'fs';
import { CliUtils } from "./CliUtils";


export class Handler {

  public static VERBOSE = false;
  static fuzzResultsString = "Fuzz - Requests Done/Success Results: ";

  fuzzStats = { done: 0, found: 0 };
  opts: any;
  generator: PayloadGenerator

  public constructor(opts: any) {
    this.opts = opts;
    this.generator = new PayloadGenerator(opts.address, opts.port);
  }


  public generatePayload(opts: any = this.opts): string {
    let xmlPayload;

    //generate payload
    if (opts.xxeIterations)
      xmlPayload = PayloadGenerator.xee(opts.xxeIterations, opts.template, opts.doctype);
    else
      xmlPayload = this.generator.generate(opts.type, opts.mode, opts.encoding, opts.commandarg, opts.template, opts.doctype);

    return xmlPayload;
  }


  public sendPayload(xmlPayload: string, opts: any): Promise<Array<any>> {
    return new Promise((resolve, reject) => {
      Requester.fromString(opts.requestFile, xmlPayload, opts.fuzzLine).then(([r, line]) => {
        const resp = HTTPParser.axiosResponseToString(r);
        resolve([opts, resp, line]);
      }).catch(([err, line]) => reject([err, line]));
    });
  }

  public shouldOutputContent(response: string, successString: string, errorString: string): boolean {
    let output = true; //if no rule defined output all responses

    if (errorString) {
      if (response.includes(errorString))
        output = false;
      else
        output = true;
    }

    if (successString) {
      if (response.includes(successString))
        output = true;
      else
        output = false;
    }

    return output;
  }

  public async doSingle(): Promise<undefined> {
    return new Promise((resolve, reject) => {

      if (Handler.VERBOSE) CliUtils.printInfo("Generating payload");
      const payload = this.generatePayload(this.opts);

      if (this.opts.output) {
        if (Handler.VERBOSE) CliUtils.printInfo("Writing payload to " + this.opts.output);
        fs.writeFileSync(this.opts.output, payload);
      }
      else {
        //print the payload if not doing a request
        //always print in verbose mode
        if (Handler.VERBOSE || !this.opts.requestFile)
          console.log("\n" + payload + "\n");
      }

      if (this.opts.requestFile) {

        if (Handler.VERBOSE) CliUtils.printInfo("Sending payload to target host");
        this.sendPayload(payload, this.opts).then(data => {
          const resp = data[1];
          const outputContent = `Response:\n\n${resp}\n\n`;

          if (this.opts.requestOutput) {
            fs.writeFileSync(this.opts.requestOutput, outputContent);
          }
          else
            CliUtils.printInfo(outputContent);

          resolve(undefined);

        }).catch(err => {
          CliUtils.printError(`Error on request ${err[1]} - ` + (err.errno || err));
        });
      }
      else {
        //if not doing requests, inform that the server has started and we are waiting for some action
        if (this.opts.mode === Mode.CDATA || this.opts.mode === Mode.OOB)
          CliUtils.printInfo("Server started, waiting for requests");
        else
          resolve(undefined);
      }
    });

  }

  public handleFuzzLine(opts: any): Promise<any> {

    if (Handler.VERBOSE) CliUtils.printInfo("Generating payload for line " + opts.fuzzLine);
    const payload = this.generatePayload(opts);
    const prom = this.sendPayload(payload, opts);
    prom.then((data) => {
      const opts = data[0];
      const resp = data[1];
      const line = data[2];
      const outputContent = `Response for ${line}\n\n${resp}\n\n`;

      const shouldOutput = this.shouldOutputContent(resp, opts.successString, opts.erroString);

      this.fuzzStats.done++;

      if (shouldOutput) { //means that the filter rules passed. found a success response
        this.fuzzStats.found++;

        if (opts.requestOutput) //output to file
          fs.appendFileSync(opts.requestOutput, outputContent); //TODO: this may be a bottleneck. Need to keep opening the files
        else  //output to console
        {
          CliUtils.printSuccess("Got Successfull Request for " + line);
          console.log(outputContent);
        }

      }

      this.printFuzzedStats();

    }).catch(err => {
      this.fuzzStats.done++;
      this.printFuzzedStats();
      CliUtils.printError(`Error on request for ${err[1]} - ` + (err[0].errno || err[0]));
    });

    return prom;
  }

  public fuzzer(): Promise<undefined> {
    return new Promise((resolve, reject) => {
      if (Handler.VERBOSE) CliUtils.printInfo("Start fuzzing");

      const opts = this.opts;
      const proms: Array<any> = [];
      this.fuzzStats = { done: 0, found: 0 };

      if (Handler.VERBOSE) CliUtils.printInfo("Check wordlist");
      this.checkWordList(opts.wordlist); //if not valid exists


      //create a file to be appended with results
      if (opts.requestOutput) {
        if (fs.existsSync(opts.requestOutput)) fs.unlinkSync(opts.requestOutput); //delete file if exists
        fs.writeFileSync(opts.requestOutput, "");
      }


      //read wordlist a line at a time
      if (Handler.VERBOSE) CliUtils.printInfo("Starting to read wordlist");
      const rd = readline.createInterface({ input: fs.createReadStream(opts.wordlist) });
      rd.on('line', (line) => {
        opts.fuzzLine = line;
        opts.commandarg = opts.originalCommandarg.replace("{{FUZZ}}", line);
        proms.push(this.handleFuzzLine(opts));
      });

      //check for all promises only when finished reading file
      rd.on('close', () => {
        Promise.all(proms).then(() => {
          console.log("");
          CliUtils.printInfo("All Done");
          resolve(undefined);
        }).catch(e => {/* rejections handled in handleFuzzLine */ });

      });
    });

  }


  public checkWordList(wordlist: string): boolean {
    //wordlist is needed for fuzz. may need to change this when adding portscan
    if (!this.opts.wordlist) {
      yargs.showHelp();
      process.exit();
    }

    //check if checklist exists
    if (!fs.existsSync(wordlist)) {
      CliUtils.printError("Wordlist file not found");
      process.exit();
    }

    return true;
  }




  private printFuzzedStats() {
    const t = `${Handler.fuzzResultsString} ${this.fuzzStats.done}/${this.fuzzStats.found}`;
    CliUtils.printInfo(t);
  }

}

