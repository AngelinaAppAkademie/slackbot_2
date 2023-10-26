import * as functions from "firebase-functions";
const { PubSub } = require('@google-cloud/pubsub');


import axios from "axios";

const pubSubClient = new PubSub();

exports.slackUiProvider = functions.region("europe-west3").
    https.onRequest(async (req, res) => {
        //return the UI to show to the user
        res.json({
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "Zu welchem Lehrinhalt ist deine Kritik?"
                    },
                    "accessory": {
                        "type": "radio_buttons",
                        "options": [
                            {
                                "text": {
                                    "type": "plain_text",
                                    "text": "Task Sheet",
                                    "emoji": true
                                },
                                "value": "value-0"
                            },
                            {
                                "text": {
                                    "type": "plain_text",
                                    "text": "Slide Deck",
                                    "emoji": true
                                },
                                "value": "value-1"
                            },
                            {
                                "text": {
                                    "type": "plain_text",
                                    "text": "Cheat Sheet",
                                    "emoji": true
                                },
                                "value": "value-2"
                            },
                        ],
                        "action_id": "radio_buttons-action"
                    }
                },
                {
                    "type": "input",
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "plain_text_input-action"
                    },
                    "label": {
                        "type": "plain_text",
                        "text": "Lektion (X.Y.Z)",
                        "emoji": true
                    }
                },
                {
                    "type": "input",
                    "element": {
                        "type": "plain_text_input",
                        "multiline": true,
                        "action_id": "plain_text_input-action"
                    },
                    "label": {
                        "type": "plain_text",
                        "text": "Beschreibung",
                        "emoji": true
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Feedback einsenden!",
                                "emoji": true
                            },
                            "value": "click_me_123",
                            "action_id": "actionId-0"
                        }
                    ]
                }
            ]
        });
    }
    );
exports.slackInteractivityHandler = functions.runWith({ secrets: ["SLACK_DAVID_PRIVATE_KEY"] }).region("europe-west3").
    https.onRequest(async (req, res) => {
        const payload = JSON.parse(req.body.payload);
        const selectedRadioButton = payload.state.values.XvfdY['radio_buttons-action'].selected_option.text.text;
        const lection = payload.state.values.SY4Sa['plain_text_input-action'].value;
        const description = payload.state.values.Ku4FL['plain_text_input-action'].value;
        const userName = payload.user.username;

        // do not create a task if the user did not fill out all fields
        if (lection == null || description == null) {
            res.sendStatus(200);
            return;
        }

        const responseUrl = payload.response_url;

        // the list id of the list in clickup
        const listId = 901500437012;

        // axios post request
        const body = {
            name: userName + ": " + selectedRadioButton + " " + lection,
            description: description,
            // the ids of David and Angi
            assignees: [82500930, 82500931],
        };

        // access the private key from the environment variables
        const headers = {
            "Authorization": process.env.SLACK_DAVID_PRIVATE_KEY,
        };

        // run a background task to send the response to slack
        // this will cause the slack ui to close after form submission
        await pubSubClient.topic("slack-response").publishMessage({
            data: Buffer.from(JSON.stringify({ responseUrl })),
        })

        // run a background task to create the task in clickup
        await pubSubClient.topic("clickup").publishMessage({
            data: Buffer.from(JSON.stringify({ listId, body, headers })),
        })

        // return a 200 response to slack
        // this response needs to be sent within 3 seconds
        // otherwise slack will show an error message to the user
        // this is why we run the background tasks above
        res.sendStatus(200);
    }
    );

export const clickUp = functions.region("europe-west3").pubsub.topic("clickup").onPublish(async (message) => {
    const listId = message.json.listId;
    const body = message.json.body;
    const headers = message.json.headers;
    await axios.post("https://api.clickup.com/api/v2/list/" + listId + "/task", body, { headers });
});
export const slackResponse = functions.region("europe-west3").pubsub.topic("slack-response").onPublish(async (message) => {
    await axios.post(message.json.responseUrl, {
        "text": "Danke für dein Feedback!",
    });
});

