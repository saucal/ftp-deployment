const SFTPClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const minimatch = require("minimatch")

global.mkdirCache = {};

class ftpClient {
	constructor(config) {
		this.connected = -1;
		this.config = config
		this.queue = {
			'*': [], // create path
			'+': [], // upload
			'-': [], // remove file
			'_': [], // maybe cleanup path
		}

		console.log(config);
		switch( this.config.type ) {
			default:
				this.client = new SFTPClient();
		}
	}

	conf( prop, val ) {
		if( typeof val === 'undefined' ) {
			return this.config[prop];
		} else {
			this.config[prop] = val;
		}
	}

	// Method
	connect() {
		let self = this;
		switch( self.config.type ) {
			case 'void':
				return new Promise( function( resolve, reject ) { resolve() } );
			default:
				return self.client.connect( self.config ).then( function() {
					self.connected = 1;
				});
		}
	}

	maybeConnect() {
		const self = this;
		if( self.connected >= 0 ) {
			return self.voidPromise()
		} else {
			self.connected = 0;
			return self
				.connect()
				.then( function() {
					let chain = self.voidPromise()
					if ( typeof self.conf( 'remoteRoot' ) === 'undefined' ) {
						chain = chain.then( function() {
							return self
								.cwd()
								.then( function( path ) {
									self.conf( 'remoteRoot', path )
								} )
						})
					}

					chain = chain.then( function() {
						return self.mkdirp( true );
					} );
			
					chain = chain.then( function() {
						let localRoot = self.conf( 'localRoot' );
						if ( typeof localRoot === 'undefined' ) {
							localRoot = '.';
						}
						if ( ! path.isAbsolute( localRoot ) ) {
							localRoot = path.resolve( process.cwd(), localRoot );
						}
						self.conf( 'localRoot', localRoot )
					});
			
					return chain;
				} );
		}
	}

	voidPromise() {
		let args = arguments;
		let self = this;
		return new Promise( function( resolve, reject ) { resolve.apply( self, args ) } );
	}

	rm( fileOrDir, recursive = true ) {
		const self = this;
		return self
			.maybeConnect()
			.then( function() {
				let remoteFullPath = path.join( self.config.remoteRoot, fileOrDir );
				switch( self.config.type ) {
					case 'void':
						console.log( 'delete', remoteFullPath );
						return self.voidPromise( true );
					default:
						console.log( 'rm: ' + remoteFullPath );
						return self.client.delete( remoteFullPath, true );
				}
			} )
			.then( function() {
				if( recursive !== true ) {
					return self.voidPromise();
				}
				const paths = self.leadingPaths( fileOrDir );
				if( paths.length > 0 ) {
					return self.rmdirIfEmpty( path.dirname( fileOrDir ) );
				} else {
					return self.voidPromise();
				}
			} );
	}

	put( fileOrDir, mkdirp = true ) {
		const self = this;
		return self
			.maybeConnect()
			.then( function() {
				if ( ! mkdirp ) {
					return self.voidPromise();
				}
				const paths = self.leadingPaths( fileOrDir );
				if( paths.length > 0 ) {
					return self.mkdirp( path.dirname( fileOrDir ) );
				} else {
					return self.voidPromise();
				}
			} )
			.then( function() {
				let localFullPath = path.join( self.config.localRoot, fileOrDir );
				let remoteFullPath = path.join( self.config.remoteRoot, fileOrDir );
				switch( self.config.type ) {
					case 'void':
						console.log( 'put', localFullPath, remoteFullPath );
						return self.voidPromise( true );
					default:
						console.log( 'put: ' + remoteFullPath );
						return self.client.put( fs.createReadStream( localFullPath ), remoteFullPath );
				}
			} );
	}

	mkdirp( dirPath ) {
		const self = this;
		return self
			.maybeConnect()
			.then( function() {
				let remoteFullPath = self.config.remoteRoot;
				if ( typeof dirPath === 'string' ) {
					remoteFullPath = path.join( remoteFullPath, dirPath );
				}

				if ( typeof global.mkdirCache[remoteFullPath] !== 'undefined' ) {
					return self.voidPromise();
				}
				global.mkdirCache[remoteFullPath] = true;
				switch( self.config.type ) {
					case 'void':
						console.log( 'mkdirp', remoteFullPath );
						return self.voidPromise();
					default:
						console.log( 'mkdirp: ' + remoteFullPath );
						return self.client.mkdir( remoteFullPath, true );
				}
			})
	}

	rmdirIfEmpty( dirPath, recursive = true ) {
		const self = this;
		const paths = recursive ? self.leadingPaths( dirPath ).reverse() : [ dirPath ];
		return self
			.maybeConnect()
			.then( function() {
				let chain = self.voidPromise();
				paths.forEach( function( thisPath ) {
					let remoteFullPath = path.join( self.config.remoteRoot, thisPath );
					chain = chain.then(function() {
						switch( self.config.type ) {
							case 'void':
								console.log( 'exist', remoteFullPath );
								return self.voidPromise().then(function(){
									console.log( 'list', remoteFullPath );
									return self.voidPromise().then(function(){
										console.log( 'rmdir', remoteFullPath );
										return self.voidPromise()
									})
								});
							default:
								console.log( 'exist: ' + remoteFullPath );
								return self.client
									.exists( remoteFullPath )
									.then( function( exists ) {
										switch ( exists ) {
											case 'd':
												console.log( 'list: ' + remoteFullPath );
												return self.client
													.list( remoteFullPath )
													.then( function( data ){
														console.log( 'rmdir: ' + remoteFullPath );
														if ( data.length === 0 ) {
															return self.client.rmdir( remoteFullPath );
														}
													} )
										}
									} )
						}
						
					} );
				} );

				return chain;
			})
	}

	cwd() {
		const self = this;
		return self
			.maybeConnect()
			.then( function() {
				switch( self.config.type ) {
					case 'void':
						console.log( 'cwd' );
						return self.voidPromise();
					default:
						return self.client.cwd();
				}
			})
	}

	end() {
		const self = this;
		switch( self.config.type ) {
			case 'void':
				console.log( 'end' );
				return self.voidPromise();
			default:
				return self.client.end();
		}
	}

	leadingPaths( dirPath ) {
		let parts = []
		if ( dirPath.indexOf( path.sep ) !== -1 ) {
			let pathParts = dirPath.split( path.sep );
			for( let i in pathParts ) {
				let next = parseInt( i )  + 1;
				parts.push( pathParts.slice( 0, next ).join( path.sep ) );
			}
		}
		return parts;
	}

	parseConfig( config ) {
		// Define config
		if ( typeof config === 'undefined' ) {
			config = {};
		}

		// Define ignore default
		if ( typeof config.ignore === 'undefined' ) {
			config.ignore = '';
		}

		// Parse ignore
		if( 0 === config.ignore.length ) {
			config.ignore = []
		} else {
			config.ignore = config.ignore.split( "\n" ).map( (item) => item.trim() );
		}

		return config;
	}

	process( readStream, config ) {
		const self = this;
		config = self.parseConfig( config );
		return new Promise( function( resolve, reject ) {
			const rl = readline.createInterface({
				input: readStream,
				crlfDelay: Infinity
			});

			let chain = self.voidPromise();

			rl.on( 'line', function( path ) {
				chain = chain.then( function() {
					return self.handleProcessLine( path, config );
				} );
			}  );

			rl.on( 'close', function() {
				chain = chain.then(function(){
					return self.processQueue();	
				}).then( function() {
					resolve();
				} );
			} );
		})
	}

	processQueue() {
		const self = this;
		return new Promise( function( resolve, reject ) {
			self.sortQueue('*');
			self.sortQueue('+');
			self.sortQueue('-');
			self.sortQueue('_', false );
			let chain = self.voidPromise();

			self.queue['*'].forEach(function(item){
				chain = chain.then( function() { 
					return self.mkdirp( item )
				} );
			});
			self.queue['+'].forEach(function(item){
				chain = chain.then( function() {
					return self.put( item, false )
				} );
			});
			self.queue['-'].forEach(function(item){
				chain = chain.then( function() {
					return self.rm( item, false )
				} );
			});
			self.queue['_'].forEach(function(item){
				chain = chain.then( function() {
					return self.rmdirIfEmpty( item, false )
				} );
			});
			chain.then( function() {
				resolve();
			});
		} );
	}

	pushToQueue( action, path ) {
		var self = this;
		if( self.queue[action].indexOf( path ) === -1 ) {
			self.queue[action].push(path)
		}
	}

	sortQueue( action, asc = true ) {
		var self = this;
		self.queue[action].sort( function( a, b ) {
			var aLen = (a.match(/\//g) || []).length
			var bLen = (b.match(/\//g) || []).length
			if( asc ) {
				return aLen - bLen || a.localeCompare(b);
			} else {
				return bLen - aLen || a.localeCompare(b);
			}
		} )
	}

	handleProcessLine( line, config ) {
		var self = this;
		var file = line.substr( 2 );
		var dir = path.dirname( file );
		var action = line.substr( 0, 1 );

		for ( let i in config.ignore ) {
			let pattern = config.ignore[i];
			if ( minimatch( '/' + path, pattern ) ) {
				console.log( 'ignored: ' + path );
				return;
			}
		}

		if( '+' == action ) {
			while ( '.' !== dir ) {
				self.pushToQueue( '*', dir );
				dir = path.dirname(dir);
			}
			self.pushToQueue( '+', file );
		} else if( '-' == action ) {
			while ( '.' !== dir ) {
				self.pushToQueue( '_', dir );
				dir = path.dirname(dir);
			}
			self.pushToQueue( '-', file );
		}
	}
}

module.exports = ftpClient;
