/*
MIT License

Copyright (c) 2017 Grall Arnaud

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict';

const IList = require('immutable').List;

// status
const STATUS_WAITING = 'status_waiting';
const STATUS_DELEGATED = 'status_delegated';
const STATUS_DONE = 'status_done';

/**
 * A StatusQueue is a queue which contains values that can be reinserted after deletion
 */
class StatusQueue {
	/**
	 * Constructor
	 */
	constructor () {
		this.queries = IList();
	}

	/**
	 * Creates a StatusQueue from an existing array
	 * @param {string[]} array - An array of queries used to build the queue
	 * @return {StatusQueue} A new StatusQueue
	 */
	static from (array) {
		const statusQueue = new StatusQueue();
		statusQueue.pushMany(...array);
		return statusQueue;
	}

	/**
	 * Get the number of elements in the queue
	 * @return {int} The number of elements in the queue
	 */
	count () {
		return this.queries.count();
	}

	/**
	 * Returns True if the queue is empty (i.e. all queries have been executed), otherwise False
	 * @return {boolean} True if the queue is empty, otherwise False
	 */
	isEmpty () {
		return this.queries.filter(q => q.status === STATUS_DONE).count() === this.count();
	}

	/**
	 * Push an element in the queue, at the end or at a specific index
	 * @param {string} query - The query to insert
	 * @param {int|undefined} index - (optional) Specify a index to insert the query at
	 * @return {void}
	 */
	push (query) {
		this.queries = this.queries.push({
			id: query,
			status: STATUS_WAITING
		});
	}

	/**
	 * Push multiple queries into the queue
	 * @param {...string} queries - Queries to push in the queue
	 * @return {void}
	 */
	pushMany (...queries) {
		queries.forEach(q => this.push(q));
	}

	/**
	 * Remove a query from the queue
	 * @param {string} query - The query to be removed
	 * @return {int} The index of the removed element in the queue
	 */
	remove (query) {
		const index = this.queries.findKey(q => q.id === query);
		this.queries = this.queries.delete(index);
		return index;
	}

	/**
	 * Set the status of a query
	 * @param {string} query - The query to update
	 * @param {string} status - The new status
	 * @return {void}
	 */
	_setStatus (query, status) {
		const index = this.queries.findKey(q => q.id === query);
		if (index > -1) {
			this.queries = this.queries.update(index, q => {
				return {
					id: q.id,
					status
				};
			});
		}
	}

	/**
	 * Set the status of a query to "waiting"
	 * @param {string} query - The query to update
	 * @return {void}
	 */
	setWaiting (query) {
		this._setStatus(query, STATUS_WAITING);
	}

	/**
	 * Set the status of a query to "delegated"
	 * @param {string} query - The query to update
	 * @return {void}
	 */
	setDelegated (query) {
		this._setStatus(query, STATUS_DELEGATED);
	}

	/**
	 * Set the status of a query to "done"
	 * @param {string} query - The query to update
	 * @return {void}
	 */
	setDone (query) {
		this._setStatus(query, STATUS_DONE);
	}
}

module.exports = StatusQueue;
