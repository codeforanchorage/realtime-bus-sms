const httpMocks = require('node-mocks-http'),
      express = require('express'),
      assert = require('assert'),
      sinon = require('sinon'),
      lib = require('../lib/bustracker')
const mw = require('../routes/middleware')

describe('Middleware Functions', function(){
    describe('sanitizeInput', function(){
        var next = sinon.stub()
        var res = {}
        it('Should remove all lines except the first', function(){
            var req = {body: {Body:"Line One\nLine Two\nLine Three"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "Line One")
        })
        it('Should replace tabs with a single space', function(){
            var req = {body: {Body:"One\tTwo\t\t\tThree"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "One Two Three")
        })
        it('Should remove emojis', function(){
            var req = {body: {Body:"5th and G 💋Street👍"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "5th and G Street")
        })
        it('Should not change normal input', function(){
            var req = {body: {Body:"1066"} }
            mw.sanitizeInput(req, res, next)
            assert(req.body.Body === "1066")
        })
    })
    describe('Check Service Exceptions', function(){
        var libStub, res, next
        beforeEach(function(){
            libStub = sinon.stub(lib, 'serviceExceptions')
            res = {render: sinon.stub(), locals: {}}
            next = sinon.stub()
        })
        afterEach(function(){
            libStub.restore()
        })
        it('Should only call call next() when not a holiday', function(){
            libStub.returns(false)
            mw.checkServiceExceptions({}, res, next)
            assert(res.render.notCalled)
            assert(next.called)
        })
        it('Should render a message on holidays', function(){
            libStub.returns(true)
            mw.checkServiceExceptions({}, res, next)
            assert(res.render.called)
            assert(next.notCalled)
        })
        it('Should set res.locals on holidays', function(){
            libStub.returns(true)
            mw.checkServiceExceptions({}, res, next)
            assert(res.locals.message && res.locals.message.hasOwnProperty('message'))
        })
    })
    describe('Check blank input', function(){
        var libStub, next, res
        beforeEach(function(){
            res = {render: sinon.stub(), locals: {}}
            next = sinon.stub()
        })
        it("Should set res.locals.action with empty input", function(){
            var req = {body: {Body:""} }
            mw.blankInputRepsonder(req, res, next)
            assert(res.locals.action === 'Empty Input')

            var req = {body: {Body:"   "} }
            mw.blankInputRepsonder(req, res, next)
            assert(res.locals.action === 'Empty Input')

            var req = {body: {Body:"\t\n"} }
            mw.blankInputRepsonder(req, res, next)
            assert(res.locals.action === 'Empty Input')
        })
    })

})
