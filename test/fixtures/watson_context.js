module.exports = {
    stop_lookup: {
      "status": 200,
      "statusText": "OK",
      "headers": {
       "content-type": "application/json; charset=utf-8",
      },
      "result": {
       "output": {
        "generic": [
         {
          "response_type": "text",
          "text": "Found stop 2051"
         }
        ],
        "intents": [
         {
          "intent": "stop_number",
          "confidence": 0.9074814319610596
         }
        ],
        "entities": [
         {
          "entity": "sys-number",
          "location": [
           12,
           16
          ],
          "value": "2051",
          "confidence": 1,
          "metadata": {
           "numeric_value": 2051
          }
         }
        ]
       },
       "context": {
        "global": {
         "system": {
          "turn_count": 4
         }
        },
        "skills": {
         "main skill": {
          "user_defined": {
           "action": "Stop Lookup"
          },
          "system": {}
         }
        }
       }
      }
     },
    stop_lookup_no_stop: {
        intents: [ { intent: 'stop_number', confidence: 0.9944038056904262 } ],
        entities:[],
        input: { text: 'stop number 1066' },
        output:{
            text: [ 'okay I found bus 1066.' ],
            nodes_visited: [ 'node_7_1480375740958' ],
            log_messages: []
        },
        context:{
            conversation_id: 'bf80ed89-f18e-436d-a9ed-cf86c63cbf56',
            system: {
                dialog_stack:  [ { dialog_node: 'root' } ],
                dialog_turn_counter: 5,
                dialog_request_counter: 5,
                _node_output_map:  { '#address': [ 0, 0 ] },
                branch_exited: true,
                branch_exited_reason: 'completed'
            },
            action: 'Stop Lookup'
        }
    },

    address_lookup: {
      "status": 200,
      "statusText": "OK",
      "headers": {
      "content-type": "application/json; charset=utf-8",
      "content-length": "427",
      },
      "result": {
      "output": {
         "generic": [
         {
         "response_type": "text",
         "text": "My search for address 5th and G Street returned zero results. You can enter a street address like '632 West 6th' or an intersection such as '6th and G street'."
         }
         ],
         "intents": [
         {
         "intent": "address",
         "confidence": 0.8689370155334473
         }
         ],
         "entities": []
      },
      "context": {
         "global": {
         "system": {
         "turn_count": 1
         }
         },
         "skills": {
         "main skill": {
         "user_defined": {
            "action": "Address Lookup"
         },
         "system": {}
         }
         }
      }
      }
   },
    address_lookup_with_known_location: {
      "status": 200,
      "statusText": "OK",
      "headers": {
       "content-type": "application/json; charset=utf-8",
       "content-length": "515",
      },
      "result": {
       "output": {
        "generic": [
         {
          "response_type": "text",
          "text": "My search for ANTHC returned zero results. You can enter a street address like '632 West 6th' or an intersection such as '6th and G street'."
         }
        ],
        "intents": [
         {
          "intent": "place",
          "confidence": 0.9883307933807373
         }
        ],
        "entities": [
         {
          "entity": "anchorage-location",
          "location": [
           0,
           5
          ],
          "value": "Alaska Native Tribal Health Consortium",
          "confidence": 1
         }
        ]
       },
       "context": {
        "global": {
         "system": {
          "turn_count": 1
         }
        },
        "skills": {
         "main skill": {
          "user_defined": {
           "action": "Known Place"
          },
          "system": {}
         }
        }
       }
      }
     },
    greeting: {
      "status": 200,
      "statusText": "OK",
      "headers": {
       "content-type": "application/json; charset=utf-8",
      },
      "result": {
       "output": {
        "generic": [
         {
          "response_type": "text",
          "text": "Hello!"
         },
         {
          "response_type": "text",
          "text": "Send me a bus stop number and I'll let you know when the next bus is coming."
         }
        ],
        "intents": [
         {
          "intent": "greetings",
          "confidence": 0.9264728546142578
         }
        ],
        "entities": []
       },
       "context": {
        "global": {
         "system": {
          "turn_count": 3
         }
        },
        "skills": {
         "main skill": {
          "user_defined": {
           "action": null
          },
          "system": {}
         }
        }
       }
      }
     },
    no_intent: {
      "status": 200,
      "statusText": "OK",
      "headers": {
       "content-type": "application/json; charset=utf-8",
      },
      "result": {
       "output": {
        "generic": [
         {
          "response_type": "text",
          "text": "Huh?"
         },
         {
          "response_type": "text",
          "text": "I have no idea what you're talking about."
         }
        ],
        "intents": [],
        "entities": []
       },
       "context": {
        "global": {
         "system": {
          "turn_count": 3
         }
        },
        "skills": {
         "main skill": {
          "user_defined": {
           "action": null
          },
          "system": {}
         }
        }
       }
      }
     }

}