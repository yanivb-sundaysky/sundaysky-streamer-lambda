import {
    ALBEvent, ALBEventRequestContext,
    ALBResult,
    APIGatewayEventRequestContext,
    APIGatewayProxyEvent,
    APIGatewayProxyResult, Handler
} from 'aws-lambda';

import {RequestRetryOptions} from "requestretry";
import {IncomingMessage} from "http";
import {Response} from "request";

const events = require('@sundaysky/logger').events;
const log = require('@sundaysky/logger').logger('handler');
const path = require('path');


let Promise = require("bluebird");
let requestRetry = require("requestretry");
let repositories = require("./config/repositories.js");


const OFFLINE_WAIT_TIMEOUT = 1000;
const WAIT_TIMEOUT = 1000 * 30;
const RETRY_SLEEP = 100;
const FileExpirationTime = 1000 * 60 * 30;

let _splunkEvent: SplunkEvent;


const getCrossDomainXML: SSKYEHandler = async (event) => {

    _splunkEvent = new SplunkEvent(event);

    let result: SSKYEResult = buildCrossDomainXMLResults();

    _splunkEvent.reportEndEvent({statusCode: result.statusCode, body: result.body});

    return Promise.resolve(result);
}


const getMediaFile: SSKYEHandler = async (event) => {

    let result: SSKYEResult;
    let connection: S3Response;

    try {

        _splunkEvent = new SplunkEvent(event);

        connection = await getConnection(event);

        result = buildRedirectResults(connection.url);

        _splunkEvent.reportEndEvent({statusCode: result.statusCode, redirectURL: connection.url});

    } catch (err) {

        result = buildResult(null);
        result.statusDescription = err.message;
        result.statusCode = 500;

        if (err instanceof S3Response) {
            result.statusCode = err.statusCode;
        }

        _splunkEvent.reportEndEvent({statusCode: result.statusCode, error: result.statusDescription});
    }

    return Promise.resolve(result);

};

const getContentFile: SSKYEHandler = async (event) => {

    let response: S3Response;
    let result: SSKYEResult;
    let connection: S3Response;

    try {

        _splunkEvent = new SplunkEvent(event);

        connection = await getConnection(event);
        response = await getFile(connection.url);
        result = buildResult(response);
        result.statusDescription = response.statusCodeDescription;

        _splunkEvent.reportEndEvent({statusCode: result.statusCode});

    } catch (err) {

        result = buildResult(null);
        result.statusDescription = err.message;
        result.statusCode = 500;

        if (err instanceof S3Response) {
            result.statusCode = err.statusCode;
        }

        _splunkEvent.reportEndEvent({statusCode: result.statusCode, error: result.statusDescription});
    }

    log.info("@@@@@@@@@@@@@@");
    log.info("event:", JSON.stringify(result));

    return Promise.resolve(result);

};

function buildCrossDomainXMLResults(): SSKYEResult {

    let result: SSKYEResult = new SSKYEResult();

    result.statusDescription = "";
    result.statusCode = 200;
    result.body = '<cross-domain-policy><allow-access-from domain="*" secure="false"/><allow-http-request-headers-from domain="* " headers="*" secure="false"/></cross-domain-policy>';
    result.isBase64Encoded = false;
    result.multiValueHeaders = {};

    return result;


}

function buildRedirectResults(url: string): SSKYEResult {

    let result: SSKYEResult = new SSKYEResult();

    result.statusDescription = "";
    result.statusCode = 302;
    result.headers = {"Location": url,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "origin, content-type, accept, authorization, x-api-key",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",};
    result.isBase64Encoded = false;
    result.multiValueHeaders = {};


    return result;


}

function buildResult(content: S3Response): SSKYEResult {

    let result: SSKYEResult = new SSKYEResult();
    if(content == null)
        return result;
    let contentType = "";
    if (content.url.indexOf(".json") > -1) {
        contentType = "application/json";
        result.body = content.body;
    } else {
        contentType = "application/text";
        result.body = content.body;
    }

    result.statusDescription = "";
    result.statusCode = 200;
    result.headers = {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "origin, content-type, accept, authorization, x-api-key",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
    };
    result.isBase64Encoded = false;
    result.multiValueHeaders = {};

    return result;
}

let getFile = async (url: string): Promise<S3Response> => {

    return new Promise((resolve, reject) => {


        let options: RequestRetryOptions = {
            maxAttempts: 5
        };


        requestRetry.get(url, options, (error: any, response: Response, body: any) => {

            if (isSuccess(response)) {

                let s3response: S3Response = new S3Response();
                s3response.statusCode = response.statusCode;
                s3response.statusCodeDescription = response.statusCode + " " + response.statusMessage;
                s3response.url = url;
                s3response.body = body;


                resolve(s3response);
            } else {

                let s3response: S3Response = new S3Response();
                s3response.statusCode = response.statusCode;
                s3response.message = "Error: " + error + " Response: " + response;
                reject(s3response);

            }
        });
    });
};

let getConnection = async (event: SSKYEEvent): Promise<S3Response> => {

    let startTime = Date.now();
    let path: Path = new Path(event);
    if (path.isExpired()) {
        let s3response: S3Response = new S3Response();
        s3response.statusCode = 404;
        s3response.message = "File is expired by timestamp in path";
        throw(s3response);
    }

    let url = path.getPathToRepository();


    _splunkEvent.reportWaitForURLStart(url);

    return new Promise((resolve, reject) => {


        let timeout = getTimeout(event);

        let options: RequestRetryOptions = {
            maxAttempts: Math.trunc(timeout / RETRY_SLEEP),
            retryDelay: RETRY_SLEEP,
            forever: true,
            retryStrategy: (err, response) => {
                return !isTimeout(startTime, timeout) && isNotExist(response)
            }

        };


        requestRetry.head(url, options, (error: any, response: Response, body: any) => {

            if (isSuccess(response)) {
                let s3response: S3Response = new S3Response();
                s3response.statusCode = response.statusCode;
                s3response.statusCodeDescription = response.statusCode + " " + response.statusMessage;
                s3response.url = url;

                _splunkEvent.reportWaitForURLEnd(s3response);

                resolve(s3response);
            } else {
                let s3response: S3Response = new S3Response();
                s3response.statusCode = response.statusCode;
                s3response.message = "Error: " + error + " Response: " + response;

                _splunkEvent.reportWaitForURLEnd(s3response);

                reject(s3response);

            }
        });
    })
};

let isSuccess = (response: IncomingMessage): boolean => {

    return response && 200 <= response.statusCode && response.statusCode < 400;
};

let isTimeout = (startTime: number, timeout: number): boolean => {

    return (Date.now() - startTime) > timeout;

};

let getTimeout = (event: SSKYEEvent): number => {

    let timeout: number = WAIT_TIMEOUT;

    try {
        if (event.queryStringParameters && event.queryStringParameters["offline"]) {

            let isOffline = JSON.parse(event.queryStringParameters["offline"]);
            if (isOffline)
                timeout = OFFLINE_WAIT_TIMEOUT;
        }
    } catch (e) {
    }

    return timeout;

};


let isNotExist = (response: IncomingMessage): boolean => {
    return response && (response.statusCode == 404 || response.statusCode == 403)
};


class Path {

    private _event: SSKYEEvent;

    private readonly _jobId: string;
    private readonly _cache: string;
    private readonly _vpc: string;
    private readonly _programId: string;
    private readonly _date: string;
    private readonly _timestamp: number;
    private readonly _type: string;
    private readonly _fileName: string;
    private readonly _rawPath: string;
    private readonly _randomDir: string;

    constructor(event: SSKYEEvent) {

        if (event == null || event.path == null) {
            throw new SSKYEError("No path: " + event);
        }

        this._event = event;

        let path = this._event.path;

        if (path.startsWith("/"))
            path = path.substring(1, path.length);

        let pathParts: string[] = path.split("/");

        if (pathParts.length != 9) {
            throw new SSKYEError("Wrong path: " + path);

        }

        this._type = pathParts[0];
        this._cache = pathParts[1];
        this._randomDir = pathParts[2];
        this._vpc = pathParts[3];
        this._programId = pathParts[4];
        this._date = pathParts[5];
        this._timestamp = Number.parseInt(pathParts[6]);
        this._jobId = pathParts[7];
        this._fileName = pathParts[8];
        this._rawPath = path;

    }

    get jobId(): string {
        return this._jobId;
    }

    get cache(): string {
        return this._cache;
    }

    get vpc(): string {
        return this._vpc;
    }

    get programId(): string {
        return this._programId;
    }

    get date(): string {
        return this._date;
    }

    get timestamp(): number {
        return this._timestamp;
    }

    get fileName(): string {
        return this._fileName;
    }

    get radnomDir(): string {
        return this._randomDir;
    }

    getPathToRepository(): string {

        return repositories[0]["com.sundaysky.streamer.repository.s3"] + "/" +
            this._cache + "/" +
            this._randomDir + "/" +
            this._vpc + "/" +
            this._programId + "/" +
            this._date + "/" +
            this._timestamp + "/" +
            this._jobId + "/" +
            this._fileName +
            this.stringifyQS();
    }

    isExpired() {
        return (Date.now() - this._timestamp > FileExpirationTime)
    }

    private stringifyQS() {
        let qs: string = "?";
        for (let key in this._event.queryStringParameters) {
            qs += key + "=" + this._event.queryStringParameters[key] + "&";
        }
        qs = qs.substring(0, qs.length - 1);
        return qs;
    }
}


export type SSKYEHandler = Handler<SSKYEEvent, SSKYEResult>;

class SSKYEError implements Error {

    message: string;
    name: string;
    stack?: string;

    constructor(msg: string) {
        this.message = msg;
    }


}

class SSKYEEvent implements APIGatewayProxyEvent, ALBEvent {
    body: string | null;
    headers: { [p: string]: string };
    httpMethod: string;
    isBase64Encoded: boolean;
    multiValueHeaders: { [p: string]: string[] };
    multiValueQueryStringParameters: { [p: string]: string[] } | null;
    path: string;
    pathParameters: { [p: string]: string } | null;
    queryStringParameters: { [p: string]: string } | null;
    requestContext: APIGatewayEventRequestContext & ALBEventRequestContext;
    resource: string;
    stageVariables: { [p: string]: string } | null;

}

class SSKYEResult implements APIGatewayProxyResult, ALBResult {

    body: string;
    headers: { [header: string]: boolean | number | string };
    isBase64Encoded: boolean;
    multiValueHeaders: { [p: string]: Array<boolean | number | string> };
    statusCode: number;
    statusDescription: string;

    constructor() {

    }

}

class S3Response {
    url: string;
    message: string;
    body: string;
    statusCode: number;
    statusCodeDescription: string;
    contentType: string;
}


class SplunkEvent {

    private _pid: string = "";
    private readonly _eventData: SSKYEEvent;
    private _jobId: string = "";
    private _componentName = "streamer-lambda";
    private _eventLog: any;

    constructor(event: SSKYEEvent) {

        this._eventData = event;

        this.setHeaders();
        this.setJobId();
        this.setProgram();

        this.reportStartEvent();
    }

    public getIdentity() {

        return {

            jobId: this._jobId,
            programId: this._pid,
            component: this._componentName,
            awsRegion: process.env.AWS_REGION
        };
    }

    getComponentName() {
        return this._componentName;
    }

    getEventData() {
        return this._eventData;
    }

    reportWaitForURLStart(url: string) {
        this._eventLog.startStage("wait-for-url", {url: url})
    }

    reportWaitForURLEnd(s3response: S3Response) {
        this._eventLog.endStage("wait-for-url", s3response);
    }

    reportEndEvent(reportData: any) {
        this._eventLog.endWithResponse(reportData);
    }

    private reportStartEvent(): any {

        log.info("request media file started!");
        log.info("event:", JSON.stringify(this._eventData));

        let identity = this.getIdentity();
        let componentName = this.getComponentName();
        let eventData = this.getEventData();

        this._eventLog = events.startRequest(componentName, eventData, identity);
        this._eventLog.metadata(identity);

    }

    private sessionizeQueryStringFields(): any {

        let queryString = this._eventData.queryStringParameters || {};
        return {
            streamingRequestTTFF: queryString["first"],
            streamingRequestTTFFS: queryString["play"],
            streamingRequestEnded: queryString["last"]
        }
    }

    private sessionizeURI(): any {

        let uriPath = this._eventData.path;

        uriPath = uriPath ? uriPath : "";
        let resourceName = path.basename(uriPath);
        let result = {resourceName};

        if (!resourceName.endsWith(".ts")) {
            return result;
        }

        let segmentIndex = path.basename(uriPath, ".ts");
        (result as any).segmentIndex = segmentIndex.indexOf("-") > 0 ? segmentIndex.substring(segmentIndex.lastIndexOf("-") + 1) : segmentIndex;

        if (segmentIndex == "1") {
            (result as any).streamingRequestArrived = "true";
        }

        return result;

    }

    private setHeaders(): void {

        if (this._eventData.path &&
            !(path.basename(this._eventData.path, ".ts") == "1") &&
            !(path.basename(this._eventData.path).indexOf("-1.ts") > 0)) {
            this._eventData.headers = {};
        }
    }

    private setProgram(): void {

        if (this._eventData.queryStringParameters && (this._eventData.queryStringParameters.pid)) {
            this._pid = this._eventData.queryStringParameters.pid;
        }
        if (this._eventData.path && this._eventData.path.toLowerCase().indexOf("sf-") > 0) {
            this._eventData.path.split("/").find((p) => {
                if (p.toLowerCase().indexOf("sf-") >= 0) {
                    this._pid = p;
                }
            })
        }
        this._pid = "NA";
    }

    private setJobId(): void {

        this._jobId = "NA";
        if (this._eventData.path) {
            let pathSplit = this._eventData.path.split("/");
            this._jobId = pathSplit.length > 1 ? pathSplit[pathSplit.length - 2] : this._jobId;
        }
    }
}

//hi

module.exports = {getContentFile, getTimeout, getMediaFile, getCrossDomainXML};
