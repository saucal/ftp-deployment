const ftpClient = require( './client' );
const readline = require('readline');

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
	.option('--debug', 'Enable Debug', true);

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
	process( readStream ) {
		const self = this;
		return new Promise( function( resolve, reject ) {
			const rl = readline.createInterface({
				input: readStream,
				crlfDelay: Infinity
			});

			let chain = self.voidPromise();

			rl.on( 'line', function( path ) {
				chain = chain.then( function() {
					return self.handleProcessLine( path );
				} );
			}  );

			rl.on( 'close', function() {
				chain = chain.then( function() {
					resolve();
				} );
			} );
		})
	}

	handleProcessLine( line ) {
		var path = line.substr( 2 );
		var action = line.substr( 0, 1 );
		if ( '-' === action ) {
			return this.rm( path, true );
		} else {
			return this.put( path, true );
		}
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
