module.exports = {
    stop_lookup: {
        intents: [ { intent: 'stop_number', confidence: 0.9944038056904262 } ],
        entities:[
            {
                entity: 'sys-number',
                location: [ 12, 16 ],
                value: '1066',
                confidence: 1,
                metadata: { numeric_value: 1066 }
            }],
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
        intents: [ { intent: 'address', confidence: 0.3610852134482194 } ],
        entities:[
            {
                entity: 'sys-number',
                location: [ 0, 5 ],
                value: '18978',
                confidence: 1,
                metadata: { numeric_value: 18978 } } ],
        input: { text: '18978 Bumbledorf Street' },
        output: {
            text: [ 'My search for address 18978 Bumbledorf Street returned zero results. You can enter a street address like \'632 West 6th\' or an intersection such as \'6th and G street\'. ' ],
            nodes_visited: [ '#address' ],
            log_messages: []
        },
        context:{
            conversation_id: 'bf80ed89-f18e-436d-a9ed-cf86c63cbf56',
            system: {
                dialog_stack:  [ { dialog_node: 'root' } ],
                dialog_turn_counter: 6,
                dialog_request_counter: 6,
                _node_output_map: { '#address': [ 0, 0 ] },
                branch_exited: true,
                branch_exited_reason: 'completed'
            },
            action: 'Address Lookup'
        }
    },
    greeting: {
        intents: [ { intent: 'greetings', confidence: 0.9853062695651725 } ],
        entities: [],
        input: { text: 'Whats up?' },
        output: {
            nodes_visited: [ 'node_1_1480374793842', 'node_2_1480445527939' ],
            text:[
                'Greetings.',
                'Send me a bus stop number and I\'ll let you know when the next bus is coming.'
            ],
           log_messages: [] },
        context: {
            conversation_id: 'bf80ed89-f18e-436d-a9ed-cf86c63cbf56',
            system: {
                dialog_turn_counter: 20,
                dialog_request_counter: 20,
                branch_exited: true,
                branch_exited_reason: 'completed'
            },
           action: null
        }
    },
    no_intent: {
        intents: [  ],
        entities: [],
        input: { text: 'Whats up?' },
        output: {
            nodes_visited: [ 'node_1_1480374793842', 'node_2_1480445527939' ],
            text:[
                'Huh?',
                'I have no idea what you are talking about!?!'
            ],
           log_messages: [] },
        context: {
            conversation_id: 'bf80ed89-f18e-436d-a9ed-cf86c63cbf56',
            system: {
                dialog_turn_counter: 20,
                dialog_request_counter: 20,
                branch_exited: true,
                branch_exited_reason: 'completed'
            },
           action: null
        }
    }

}