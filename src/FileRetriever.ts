import {ALBEvent, APIGatewayProxyHandler, Context} from "aws-lambda";


let Path = require("../Path")

let Repositories = require( "../config/repositories");
let requestRetry = require("requestretry");
import {RequestRetryOptions} from "requestretry";
let Promise = require("bluebird");


export class FileRetriever{

    private event:ALBEvent;
    private context: Context;

    constructor(event: ALBEvent, _context: Context){
        this.event = event;
        this.context = _context;

    };


     async getConnection(){

        let d = await this.testConnection();

        console.log(d);


    }

    private async testConnection():Promise<any>{

        return new Promise((resolve,reject)=>{

            let url = this.getPathToRepository();
            let options:RequestRetryOptions = {
                maxAttempts:1,
                retryDelay:100,
                forever:true
            };


            requestRetry.head(url,options,(error,response,body)=>{

                if(error)
                {
                    reject(error);
                }
                else{
                    resolve("response: " + response + ", body: " + body);
                }
            });
        })
    }




    private getTimeout():number {

        let timeout: number = Repositories.Config.onlineTimeout;
        let offlineParam:string = this.event.queryStringParameters["offline"];

        if(offlineParam != undefined && offlineParam === "true"){
            timeout = Repositories.Config.offlineTimeout;
        }

        return timeout;

    }

    getFileURL():string{

        //repos as query string?

       return Repositories.Repo.default + "/streamer/" + this.getPathToRepository();
    }

    getPathToRepository():string{

        let path = new Path(this.event.path);

        let pathToRepository:string = "/streamer/" +
            path.cache + "/" +
            path.vpc + "/" +
            path.programId + "/" +
            path.date + "/" +
            path.timestamp + "/" +
            path.jobId + "/" +
            path.fileName;

        return pathToRepository;
    }

    stringifyQS():string {

        let qs:any = "?";
        for(let key in this.event.queryStringParameters){
            qs+= key + "=" + this.event.queryStringParameters[key] + "&";
        }
        return qs;
    }
}