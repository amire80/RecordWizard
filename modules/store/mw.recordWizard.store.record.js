'use strict';

( function ( mw, rw ) {
	/**
	 * @class StateStore
	 * @constructor
	 */
	var RecordStore = function () {
		this.data = {
			metadata: {
				language: rw.store.config.data.savedLanguage,
				license: rw.store.config.data.savedLicense,
				media: 'audio',
				locutor: {
					gender: '',
					languages: {},
					location: '',
					name: '',
					qid: '',
					main: false,
					new: false,
				},
			},
			words: [],
			records: {},
			status: {},
			errors: {},
			checkboxes: {},
		};
		this.$api = new mw.Api();
	};

	RecordStore.prototype.setLocutor = function ( locutor ) {
		this.data.metadata.locutor.gender = locutor.gender;
		Vue.set( this.data.metadata.locutor, 'languages', locutor.languages );
		this.data.metadata.locutor.location = locutor.location;
		this.data.metadata.locutor.name = locutor.name;
		this.data.metadata.locutor.qid = locutor.qid;
		this.data.metadata.locutor.main = locutor.main || false;
		this.data.metadata.locutor.new = locutor.new || locutor.qid === null;

		// if there are already some records done, remove them when changing locutor
		this.clearAllRecords();
	};

	RecordStore.prototype.clearRecord = function ( word ) {
		var i = this.data.words.indexOf( word );

		// Check if the word is in our list
		if ( i === -1 ) {
			return false;
		}

		// Remove all mentions of this word
		Vue.delete( this.data.records, this.data.words[ i ] );
		Vue.delete( this.data.status, this.data.words[ i ] );
		Vue.delete( this.data.errors, this.data.words[ i ] );
		Vue.delete( this.data.checkboxes, this.data.words[ i ] );
		this.data.words.splice( i, 1 );

		return true;
	};

	RecordStore.prototype.clearAllRecords = function () {
		var i;

		for ( i = 0; i < this.data.words.length; i++ ) {
			Vue.delete( this.data.records, this.data.words[ i ] );
			Vue.delete( this.data.status, this.data.words[ i ] );
			Vue.delete( this.data.errors, this.data.words[ i ] );
			Vue.delete( this.data.checkboxes, this.data.words[ i ] );
		}

		this.data.words.splice( 0, this.data.words.length );
	};

	RecordStore.prototype.resetRecord = function ( word ) {
		this.data.records[ word ].reset();
		this.data.errors[ word ] = false;
		this.data.status[ word ] = 'up';
		this.data.checkboxes[ word ] = true;
	};

	RecordStore.prototype.randomiseList = function() {
		var i, tmp, randomIndex;

		// Fisher-Yates shuffle
		for ( i = this.data.words.length - 1; i >= 0; i-- ) {
			randomIndex = Math.floor( Math.random() * ( i + 1 ) );

			tmp = this.data.words[ randomIndex ];
			Vue.set( this.data.words, randomIndex, this.data.words[ i ] );
			Vue.set( this.data.words,  i, tmp );
		}
	};

	RecordStore.prototype.addWords = function( words ) {
		var i, word, extra;

		// Allow to add a single word
		if ( Array.isArray( words ) === false ) {
			words = [ words ];
		}

		for ( i = 0; i < words.length; i++ ) {
			word = words[ i ];
			extra = {};

			// Separate extra informations about the word, if any
			if ( typeof word !== 'string' ) {
				extra = word;
				word = extra.text;
				delete extra.text;
			}

			// Trim the word
			word = word.replace( /\t/g, '' ).trim();

			// Check if the string is valid
			if ( word === '' ) {
				continue;
			}

			// Avoid duplicate words in the list
			if ( this.data.words.indexOf( word ) === -1 ) {
				// Create a Record instance for this word
				if ( this.data.records[ word ] === undefined ) {
					this.data.records[ word ] = new rw.Record( word );
					this.data.records[ word ].setLanguage( rw.store.config.data.languages[ this.data.metadata.language ] );
					this.data.records[ word ].setLocutor( this.data.metadata.locutor );
					this.data.records[ word ].setLicense( this.data.metadata.license );

					Vue.set( this.data.status, word, 'up' );
					Vue.set( this.data.errors, word, false );
					Vue.set( this.data.checkboxes, word, true );
				}
				this.data.records[ word ].setExtra( extra );

				// Add the word to the list
				this.data.words.push( word );
			}
		}
	};

	RecordStore.prototype.hasStatus = function( status ) {
		var i;

		if ( Array.isArray( status ) === false ) {
			status = [ status ];
		}

		for ( i = 0; i < this.data.words.length; i++ ) {
			// Check if the word is not stashed yet
			if ( status.indexOf( this.data.status[ this.data.words[ i ] ] ) > -1 ) {
				return true;
			}
		}

		return false;
	};

	RecordStore.prototype.countStatus = function( status, checkCheckbox ) {
		var i,
			counter = 0;

		if ( Array.isArray( status ) === false ) {
			status = [ status ];
		}

		// TODO: replace this loop (called way too often) by a fixed counter for
		// obvious performance reason, but also to simplify vue properties recomputation
		// cf vue.publish.js
		for ( i = 0; i < this.data.words.length; i++ ) {
			// Check if the word is not stashed yet
			if ( status.indexOf( this.data.status[ this.data.words[ i ] ] ) > -1 ) {
				if ( checkCheckbox === false || this.data.checkboxes[ this.data.words[ i ] ] === true ) {
					counter++;
				}
			}
		}

		return counter;
	};

	RecordStore.prototype.hasErrors = function() {
		var i;

		for ( i = 0; i < this.data.words.length; i++ ) {
			// Check if the word has not an error message
			if ( this.data.errors[ this.data.words[ i ] ] !== false ) {
				return true;
			}
		}

		return false;
	};

	RecordStore.prototype.countErrors = function() {
		var i,
			counter = 0;

		for ( i = 0; i < this.data.words.length; i++ ) {
			// Check if the word has not an error message
			if ( this.data.errors[ this.data.words[ i ] ] !== false ) {
				counter++;
			}
		}

		return counter;
	};

	RecordStore.prototype.resetAllErrors = function() {
		var i;

		for ( i = 0; i < this.data.words.length; i++ ) {
			// Check if the word is not stashed yet
			if ( this.data.errors[ this.data.words[ i ] ] !== false ) {
				this.resetRecord( this.data.words[ i ] );
			}
		}
	};

	RecordStore.prototype.resetStashingRecords = function() {
		var i;

		for ( i = 0; i < this.data.words.length; i++ ) {
			// Check if the word is not stashed yet
			if ( this.data.status[ this.data.words[ i ] ] === 'stashing' ) {
				this.resetRecord( this.data.words[ i ] );
			}
		}
	};

	RecordStore.prototype.doStash = function ( word, blob ) {
	   this.data.errors[ word ] = false;
	   this.data.status[ word ] = 'ready';

	   if ( blob !== undefined ) {
		   this.data.records[ word ].setBlob(
			   blob,
			   ( this.data.metadata.media === 'audio' ? 'wav' : 'webm' )
		   );
	   }

	   this.data.status[ word ] = 'stashing';
	   rw.requestQueue.push( this.data.records[ word ].uploadToStash.bind( this.data.records[ word ], this.$api ) ).then(
		   this.stashSuccess.bind( this, word ),
		   this.requestError.bind( this, word, 'ready' )
	   );
   };

   RecordStore.prototype.doPublish = function ( word ) {
	  this.data.errors[ word ] = false;
	  this.data.status[ word ] = 'uploading';

	  rw.requestQueue.push( this.data.records[ word ].finishUpload.bind( this.data.records[ word ], this.$api ) ).then(
		  this.doFinalize.bind( this, word ),
		  this.requestError.bind( this, word, 'stashed' )
	  );
  };

  RecordStore.prototype.doFinalize = function ( word ) {
	 this.data.errors[ word ] = false;
	 this.data.status[ word ] = 'finalizing';

	 rw.requestQueue.force( this.data.records[ word ].saveWbItem.bind( this.data.records[ word ], this.$api ) ).then(
		 this.publishSuccess.bind( this, word ),
		 this.requestError.bind( this, word, 'uploaded' )
	 );
 };

 RecordStore.prototype.stashSuccess = function( word ) {
	 this.data.status[ word ] = 'stashed';
	 this.data.checkboxes[ word ] = true;
 };

  RecordStore.prototype.publishSuccess = function( word ) {
	  this.data.status[ word ] = 'done';
	  this.data.checkboxes[ word ] = true;
  };


  RecordStore.prototype.requestError = function( word, prevState, error, errorData ) {
	  // If the upload has been abort, it means another piece of code
	  // is doing stuff right now, so don't mess-up with it
	  if ( errorData !== undefined && errorData.textStatus === 'abort' ) {
		  return;
	  }

	  console.info( '[Request error]', word, error, errorData );

	  this.data.status[ word ] = prevState;
	  this.data.errors[ word ] = error;
  };

	rw.store.record = new RecordStore();

}( mediaWiki, mediaWiki.recordWizard ) );
