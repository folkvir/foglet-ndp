'use strict';
require('chai').should();
const StatusQueue = require('../src/status-queue.js');

describe('StatusQueue', () => {
	it('should be built from an array', () => {
		const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
		queue.count().should.equal(3);
		queue.queries.includes('q1').should.be.true;
		queue.queries.includes('q2').should.be.true;
		queue.queries.includes('q3').should.be.true;
	});

	it('should asserted empty or not', () => {
		const queue = new StatusQueue();
		queue.isEmpty().should.be.true;
		queue.push('q1');
		queue.isEmpty().should.be.false;
	});

	describe('#push', () => {
		it('should push the item when used without index', () => {
			const queue = new StatusQueue();
			queue.push('q1');
			queue.count().should.equal(1);
			queue.queries.first().should.equal('q1');

			queue.push('q2');
			queue.count().should.equal(2);
			queue.queries.last().should.equal('q2');
		});

		it('should insert at a given index when using index', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
			queue.push('q4', 1);
			queue.queries.toJS().should.deep.equal([ 'q1', 'q4', 'q2', 'q3' ]);
		});
	});

	describe('remove', () => {
		it('should remove a query and return its index', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3' ]);
			const index = queue.remove('q2');
			index.should.equal(1);
			queue.count().should.equal(2);
			queue.queries.toJS().should.deep.equal([ 'q1', 'q3' ]);
		});

		it('should only remove one instance of a query with duplicates in the queue', () => {
			const queue = StatusQueue.from([ 'q1', 'q2', 'q3', 'q2', 'q2' ]);
			const index = queue.remove('q2');
			index.should.equal(1);
			queue.count().should.equal(4);
			queue.queries.toJS().should.deep.equal([ 'q1', 'q3', 'q2', 'q2' ]);
		});
	});
});
