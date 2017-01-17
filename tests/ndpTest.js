const Spray = require('spray-wrtc');

const NDP = require('../src/ndp.js');

describe('[NDP]', function () {
	it('Initialization', function () {
		const f = new NDP({
			spray: new Spray({
				protocol: 'test',
				webrtc:	{
					trickle: true,
					iceServers: []
				}
			}),
			protocol: 'test',
			room: 'test'
		});
		f.send([], '');
	});
});
