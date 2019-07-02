import jenkins.model.*


node {
    try{
        stage('Deploy') {
            //bat 'set > env.txt'
            //for (String i : readFile('env.txt').split("\r?\n")) {
              //   println i
            //}
            deleteDir()
            script {
                println "Git branch: " + env.BRANCH_NAME
                stages = ["dev"]
                credentialsIdVars = ["3e14aa2f-49bf-4bf0-ba45-b6453db64df4"]
                awsAccountsIds = ["651241207884"]


                if(env.BRANCH_NAME.equalsIgnoreCase('master')){
                    //stages = ["prod", "hipaa"]
                    stages = ["prod"]
                    //credentialsIdVars = ["d8e42ac0-2745-44b5-8cc1-f5b9cf4e6cca", "858d5401-a4a4-4476-816f-8b847508e6d5"]
                    credentialsIdVars = ["d8e42ac0-2745-44b5-8cc1-f5b9cf4e6cca"]
                    //awsAccountsIds = ["383543149372", "450185025030"]
                    awsAccountsIds = ["383543149372"]
                }
            }

            stage('Pull from Github') {
                checkout([$class: 'GitSCM', branches: [[name: '*/${BRANCH_NAME}']], doGenerateSubmoduleConfigurations: false, extensions: [], submoduleCfg: [], userRemoteConfigs: [[credentialsId: 'c97657ea-e198-4d9b-9a34-ab8f814de699', url: 'https://github.com/SundaySky/sundaysky-streamer-lambda']]])
            }

            stage('npm install'){
                withNPM(npmrcConfig: 'ac210c71-dcd5-41b5-937c-c56753016e17') {
                    bat 'npm install'
                    bat 'npm update'
                }
            }


            for (i = 0; i < stages.size() ; i++) {
                env.RESOLVED_STAGE = stages[i]
                credentialsIdVar = credentialsIdVars[i]
                env.AWS_ACCOUNT_ID = awsAccountsIds[i]

                nodejs('nodejs8') {
                    withCredentials([usernamePassword(credentialsId: credentialsIdVar, passwordVariable: 'AWS_SECRET_ACCESS_KEY', usernameVariable: 'AWS_ACCESS_KEY_ID')]) {
                        bat 'npm run deploy --  -s %RESOLVED_STAGE% --region us-east-1'
                        bat 'aws logs put-subscription-filter --log-group-name /aws/lambda/sundaysky-streamer-lambda-%RESOLVED_STAGE%-cross-domain --filter-name ToKinesis --filter-pattern "EVENT" --destination-arn arn:aws:firehose:us-east-1:%AWS_ACCOUNT_ID%:deliverystream/splunk.ss_dvg_tracking --role-arn arn:aws:iam::%AWS_ACCOUNT_ID%:role/CWLtoKinesisFirehoseRole --region %CURR_REGION%'
                        bat 'aws logs put-subscription-filter --log-group-name /aws/lambda/sundaysky-streamer-lambda-%RESOLVED_STAGE%-content --filter-name ToKinesis --filter-pattern "EVENT" --destination-arn arn:aws:firehose:us-east-1:%AWS_ACCOUNT_ID%:deliverystream/splunk.ss_dvg_tracking --role-arn arn:aws:iam::%AWS_ACCOUNT_ID%:role/CWLtoKinesisFirehoseRole --region %CURR_REGION%'
                        bat 'aws logs put-subscription-filter --log-group-name /aws/lambda/sundaysky-streamer-lambda-%RESOLVED_STAGE%-media --filter-name ToKinesis --filter-pattern "EVENT" --destination-arn arn:aws:firehose:us-east-1:%AWS_ACCOUNT_ID%:deliverystream/splunk.ss_dvg_tracking --role-arn arn:aws:iam::%AWS_ACCOUNT_ID%:role/CWLtoKinesisFirehoseRole --region %CURR_REGION%'
                    }
                }
            }
        }
    }
    catch (errors) {
        errors.printStackTrace()
        error "${errors}"
    }
    finally {
        //notify slack
        def buildResult = currentBuild.currentResult
        echo "buildResult: " + buildResult
        echo "currentBuild.result: " + currentBuild.result
        def buildTime = currentBuild.durationString
        if (buildTime.contains(" and counting")) {
            buildTime = buildTime.replaceAll(" and counting","")
        }
        echo "buildTime: " + buildTime
        def msg = "${env.JOB_NAME} - #${env.BUILD_NUMBER} - " + buildResult + " in " + buildTime + " - <${env.BUILD_URL}|Open>"
        echo "going to send the following msg to slack: " + msg
        def baseUrl = "https://sundaysky.slack.com/services/hooks/jenkins-ci/"
        def channel = "#infra-notifications"

        if ( buildResult == "SUCCESS" ) {
            slackSend color: "good", message: msg, baseUrl: baseUrl, channel: channel
        }
        else if( buildResult == "FAILURE" ) {
            slackSend color: "danger", message: msg, baseUrl: baseUrl, channel: channel
        }
        else if( buildResult == "UNSTABLE" ) {
            slackSend color: "warning", message: msg, baseUrl: baseUrl, channel: channel
        }
        else {
            slackSend color: "danger", message: msg, baseUrl: baseUrl, channel: channel
        }
    }
}