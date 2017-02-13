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
	 * @param {string} id - Query unique id
	 * @param {string} query - The query to insert
	 * @param {int|undefined} index - (optional) Specify a index to insert the query at
	 * @return {void}
	 */
	push (id, query) {
		this.queries = this.queries.push({
			id,
			query,
			status: STATUS_WAITING
		});
	}

	/**
	 * Push multiple queries into the queue
	 * @param {...string} queries - Queries to push in the queue
	 * @return {void}
	 */
	pushMany (...queries) {
		queries.forEach(q => this.push(q, q));
	}

	/**
	 * Remove a query from the queue
	 * @param {string} id - Query unique id
	 * @return {int} The index of the removed element in the queue
	 */
	remove (id) {
		const index = this.queries.findKey(q => q.id === id);
		this.queries = this.queries.delete(index);
		return index;
	}

	/**
	 * Clear the queue
	 * @return {void}
	 */
	clear () {
		this.queries = this.queries.clear();
	}

	/**
	 * Get first waiting query in the queue
	 * @return {string} The first wiaiting query in the queue
	 */
	first () {
		const index = this.queries.findKey(q => q.status === STATUS_WAITING);
		console.log(index);
		if (index <= -1) return null;
		const query = this.queries.get(index);
		console.log(query);
		return query;
	}

	/**
	 * Return true if the queue has 1 or more waiting queries
	 * @return {boolean} True if one or more queries have the status STATUS_WAITING
	 */
	hasWaitingQueries () {
		return this.queries.filter(q => q.status === STATUS_WAITING).count() > 0;
	}
	
	/**
	 * Set the status of a query
	 * @param {string} id - Query unique id
	 * @param {string} status - The new status
	 * @return {void}
	 */
	_setStatus (id, status) {
		const index = this.queries.findKey(q => q.id === id);
		if (index > -1) {
			this.queries = this.queries.update(index, q => {
				return {
					id: q.id,
					query: q.query,
					status
				};
			});
		}
	}

	getStatus (id) {
		const index = this.queries.findKey(q => q.id === id);
		if (index > -1) {
			return this.queries.get(index).status;
		}
		return null;
	}

	/**
	 * Set the status of a query to "waiting"
	 * @param {string} id - Query unique id
	 * @return {void}
	 */
	setWaiting (id) {
		this._setStatus(id, STATUS_WAITING);
	}

	/**
	 * Set the status of a query to "delegated"
	 * @param {string} id - Query unique id
	 * @return {void}
	 */
	setDelegated (id) {
		this._setStatus(id, STATUS_DELEGATED);
	}

	/**
	 * Set the status of a query to "done"
	 * @param {string} id - Query unique id
	 * @return {void}
	 */
	setDone (id) {
		this._setStatus(id, STATUS_DONE);
	}
}

module.exports = StatusQueue;
