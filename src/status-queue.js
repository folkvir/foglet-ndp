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
	 * Returns True if the queue is empty, otherwise False
	 * @return {boolean} True if the queue is empty, otherwise False
	 */
	isEmpty () {
		return this.count() <= 0;
	}

	/**
	 * Push an element in the queue, at the end or at a specific index
	 * @param {string} query - The query to insert
	 * @param {int|undefined} index - (optional) Specify a index to insert the query at
	 * @return {void}
	 */
	push (query, index) {
		const i = index || this.queries.count();
		this.queries = this.queries.insert(i, query);
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
		const index = this.queries.findKey(q => q === query);
		this.queries = this.queries.delete(index);
		return index;
	}
}

module.exports = StatusQueue;
