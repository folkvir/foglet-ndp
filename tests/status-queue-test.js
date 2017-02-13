'use strict';
require('chai').should();
const StatusQueue = require('../src/status-queue.js');

describe('StatusQueue', () => {
	it('should be built from an array', () => {
		const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
		queue.count().should.equal(3);
	});

	it('should asserted empty or not', () => {
		const queue = new StatusQueue();
		queue.isEmpty().should.be.true;
		queue.push('q1');
		queue.isEmpty().should.be.false;
		queue.setDone('q1');
		queue.isEmpty().should.be.true;
	});

	describe('#push', () => {
		it('should push the item to the queue', () => {
			const queue = new StatusQueue();
			queue.push('q1');
			queue.count().should.equal(1);
			queue.queries.first().id.should.equal('q1');

			queue.push('q2');
			queue.count().should.equal(2);
			queue.queries.last().id.should.equal('q2');
		});
	});

	describe('remove', () => {
		it('should remove a query and return its index', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
			const index = queue.remove('q2');
			index.should.equal(1);
			queue.count().should.equal(2);
		});

		it('should only remove one instance of a query with duplicates in the queue', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3', 'q2', 'q2' ]);
			const index = queue.remove('q2');
			index.should.equal(1);
			queue.count().should.equal(4);
		});
	});

	describe('#status', () => {
		it('should be able to set any status to a query', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
			queue._setStatus('q3', 'new_status');
			queue.queries.last().status.should.equal('new_status');
		});

		it('should set the status of a query to "waiting"', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
			queue._setStatus('q3', 'some_status');
			queue.setWaiting('q3');
			queue.queries.last().status.should.equal('status_waiting');
		});

		it('should set the status of a query to "delegated"', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
			queue.setDelegated('q3');
			queue.queries.last().status.should.equal('status_delegated');
		});

		it('should set the status of a query to "done"', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
			queue.setDone('q3');
			queue.queries.last().status.should.equal('status_done');
		});
	});
});
