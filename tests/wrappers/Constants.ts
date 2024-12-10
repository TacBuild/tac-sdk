export abstract class Op {
    static readonly multisig = {
        new_order : 0xf718510f,
        execute: 0x75097f5d,
        execute_internal: 0xa32c59bf,
        update_multisig_params: 0x1d0cfbd3,
        change_admin_address: 0x581879bc,
        change_collaterals_info: 0x3a858e9b
    }
    static readonly order = {
        approve: 0xa762230f,
        expired: 0x6,
        approve_rejected : 0xafaf283e,
        approved: 0x82609bf6,
        init: 0x9c73fba2
    }
}

export abstract class Errors {
    static readonly multisig = {
        unauthorized_new_order : 1007,
        invalid_new_order : 1008,
        not_from_admin : 70,
        not_enough_ton : 100,
        unauthorized_execute : 101,
        singers_outdated : 102,
        invalid_dictionary_sequence: 103,
        invalid_threshold: 109,
        expired: 111
    }
    static readonly order = {
        unauthorized_init : 104,
        already_approved : 107,
        already_inited : 105,
        unauthorized_sign : 106,
        expired: 111,
        unknown_op: 0xffff,
        already_executed: 112
    }
    static readonly signature = {
        sender_public_key_not_found: 31,
        invalid_sender_signature: 32,
        public_key_not_found: 35,
        invalid_signature: 36
    }
}

export abstract class Params {
    static readonly bitsize = {
        op : 32,
        queryId : 64,
        orderSeqno : 256,
        hash : 256,
        signerIndex : 8,
        actionIndex : 8,
        time: 48
    }
}