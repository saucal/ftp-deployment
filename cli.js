#!/usr/bin/env node

const ftpClient = require( './client' );

const { program } = require('commander');
const fs = require('fs');
const path = require('path');

program
	.option('--type <type>', 'Connection type', 'sftp' )
	.option('--host <host>', 'Host' )
	.option('--port <port>', 'Port' )
	.option('-u, --user <user>', 'User' )
	.option('-p, --pass <pass>', 'Password' )
	.option('--remote-root <path>', 'Remote Root (absolute)' )
	.option('--local-root <path>', 'Local Root (absolute or relative to cwd)', '.' )
	.option('--debug', 'Enable Debug', false);

program.parse();

const opts = program.opts();

class cliFTPClient extends ftpClient {
	constructor() {
		super( {
			type: opts.type,
			host: opts.host,
			port: opts.port,
			username: opts.user,
			password: opts.pass,
			remoteRoot: opts.remoteRoot,
			localRoot: opts.localRoot,
			debug: opts.debug ? (msg) => {
				if (msg.startsWith('CLIENT')) {
					console.error(msg);
				}
			} : undefined,
		} );
	}
}


function readData() {
	if( typeof program.args[0] === 'undefined' ) {
		return process.stdin;
	} else {
		return fs.createReadStream( path.resolve( process.cwd(), program.args[0] ) )
	}
}

const client = new cliFTPClient();

client
	.maybeConnect()
	.then( function() {
		return client.process( readData() );
	} )
	.then( function() {
		return client.end()
	} )

// client.process( data );
