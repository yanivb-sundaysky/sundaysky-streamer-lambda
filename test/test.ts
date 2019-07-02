//import {Path} from "../src/handler";

let assert = require("assert");
let handler = require("../src/handler");

let statusRequest = require("./resources/alb-requests/alb-event-status");
let masterPlayListRequest = require("./resources/alb-requests/alb-event-m3u8-master-playlist");
let offlineRequest = require("./resources/alb-requests/alb-event-with-offline-param");
let onlineRequest = require("./resources/alb-requests/alb-event-with-no-offline-param");
let wrongPathRequest = require("./resources/alb-requests/alb-event-with-wrong-path");
let mediaFileRequest = require("./resources/alb-requests/alb-event-with-media-request");

describe("Streamer functionality",()=>{


    it("should get status.json", (done) => {
        setTimeout(done,5000);

       handler.getContentFile(statusRequest,null,null).then(value => {
            assert.strictEqual(value.statusCode, 200);
        }
    ).catch(err=> console.log(err));

    });
    it("should get master play list file ", (done) => {


        handler.getContentFile(masterPlayListRequest,null,null).then(value => {

                assert.strictEqual(value.statusCode, 200);
                done();

            }
        ).catch(err=> console.log(err));

    });
    it("should use offline timeout", () => {


        let timeout = handler.getTimeout(offlineRequest);

        assert.strictEqual(timeout,1000 );
    });
    it("should not use offline param", () => {

        let timeout = handler.getTimeout(onlineRequest);

        assert.strictEqual(timeout,1000*30 );
    });
    it("should fail on wrong path", (done) => {

        handler.getContentFile(wrongPathRequest,null,null).then(value => {


                assert.strictEqual(value.statusCode, 500);
                done();

            }
        ).catch(err=> console.log(err));
    })
    it("should build query string",(done)=>{

        setTimeout(done,4000);
        handler.getMediaFile(mediaFileRequest,null,null).then(value => {

            let url = value.headers.Location;
            let start = url.indexOf("?");
            let qs = url.substring(start);
            console.log(qs);
            assert.strictEqual(qs,"?pid=noprogram%2Fmyproject&rid=9c5f7c31-11e2-4917-abc7-6f225ddb9e9f&segmentDuration=1000&play=true");
            done();

            }
        ).catch(err=> console.log(err));
    });
    it("should redirect media file", (done) => {
        setTimeout(done,5000);

        handler.getMediaFile(mediaFileRequest,null,null).then(value => {

                assert.strictEqual(value.statusCode, 302);

                assert.strictEqual(value.headers.Location, "https://sundaysky-streamer-dev.s3-external-1.amazonaws.com/streamer/r30m/yanivb/noprogram/20190612/2855484791000/91e1ba88-56de-4d5f-a610-f092164ac860/704501611697700_1655786153034201-1.ts?pid=noprogram%2Fmyproject&rid=9c5f7c31-11e2-4917-abc7-6f225ddb9e9f&segmentDuration=1000&play=true");
                done();
            }
        ).catch(err=> console.log(err));

    });
    it("should return cross domain xml", (done) => {
        setTimeout(done,5000);

        handler.getCrossDomainXML(mediaFileRequest,null,null).then(value => {

                assert.strictEqual(value.statusCode, 200);

                assert.strictEqual(value.body, "<cross-domain-policy><allow-access-from domain=\"*\" secure=\"false\"/><allow-http-request-headers-from domain=\"* \" headers=\"*\" secure=\"false\"/></cross-domain-policy>");
                done();
            }
        ).catch(err=> console.log(err));

    });

});
