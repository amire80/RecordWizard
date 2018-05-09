'use strict';

( function ( mw, rw, $, OO ) {
	/**
	 * The Studio step.
	 *
	 * @class rw.controller.Studio
	 * @extends mw.recordWizard.controller.Step
	 * @constructor
	 * @param {mw.Api} api     API instance to perform requests
	 * @param {Object} config  RecordWizard config object.
	 */
	rw.controller.Studio = function ( api, config ) {
		rw.controller.Step.call(
			this,
			new rw.ui.Studio(),
			api,
			config
		);

		this.stepName = 'studio';
	};

	OO.inheritClass( rw.controller.Studio, rw.controller.Step );

	/**
	 * @inheritDoc
	 */
	rw.controller.Studio.prototype.load = function () {
		var word,
			controller = this;

		if ( rw.metadatas.statesCount === undefined ) {
			rw.metadatas.statesCount = {
				ready: 0,
				stashing: 0,
				stashed: 0,
				uploading: 0,
				uploaded: 0,
				finalizing: 0,
				done: 0,
				error: 0
			};
		}

		rw.controller.Step.prototype.load.call( this );

		for ( word in rw.records ) {
			rw.records[ word ].on( 'state-change', this.switchState.bind( this ) );
		}

		this.recorder = new rw.libs.LinguaRecorder( {
			autoStart: true,
			autoStop: true,
			onSaturate: 'discard'
		} );
		this.isRecording = false;
		this.currentWord = rw.metadatas.words[ 0 ];

		this.recorder.on( 'ready', this.ui.onReady.bind( this.ui ) );
		this.recorder.on( 'started', this.onStart.bind( this ) );
		this.recorder.on( 'recording', this.ui.onRecord.bind( this.ui ) );
		this.recorder.on( 'stoped', this.onStop.bind( this ) );
		this.recorder.on( 'canceled', this.onCancel.bind( this ) );
		this.recorder.on( 'saturated', this.onSaturate.bind( this ) );

		this.ui.on( 'studiobutton-click', function () {

			if ( controller.isRecording ) {
				controller.recorder.cancel();
				controller.isRecording = false;
				controller.ui.onStop();
			} else {
				if ( controller.startNextRecord() ) {
					controller.ui.onStart();
				}
			}

		} );

		this.ui.on( 'item-click', this.selectWord.bind( this ) );

		this.ui.on( 'previous-item-click', function () {
			var index = rw.metadatas.words.indexOf( controller.currentWord );
			if ( index > 0 ) {
				controller.selectWord( rw.metadatas.words[ index - 1 ] );
			}
		} );

		this.ui.on( 'next-item-click', function () {
			var index = rw.metadatas.words.indexOf( controller.currentWord );
			if ( index > -1 && index < rw.metadatas.words.length - 1 ) {
				controller.selectWord( rw.metadatas.words[ index + 1 ] );
			}
		} );

		this.ui.on( 'wordinput-validate', function ( word ) {
			var i;

			if ( rw.metadatas.words.indexOf( word ) !== -1 ) {
				return;
			}

			rw.records[ word ] = new rw.Record( word );
			rw.records[ word ].on( 'state-change', controller.switchState.bind( controller ) );

			rw.metadatas.words.push( word );
			controller.ui.addWord( word );

			// Move the cursor to the new item only if all the items (except the
			// last one, the one we've just added) have already been recorded
			for ( i = 0; i < rw.metadatas.words.length - 1; i++ ) {
				if ( rw.records[ rw.metadatas.words[ i ] ] === undefined ) {
					return;
				}
			}
			controller.currentWord = word;
			controller.ui.setSelectedItem( word );

		} );

		this.ui.on( 'retry-click', function ( word ) {
			for ( word in rw.records ) {
				if ( rw.records[ word ].hasFailed() ) {
					controller.upload( word );
				}
			}
		} );
	};

	/**
	 * @inheritDoc
	 */
	rw.controller.Studio.prototype.unload = function () {
		var word;

		this.ui.off( 'studiobutton-click' );
		this.ui.off( 'item-click' );
		this.ui.off( 'previous-item-click' );
		this.ui.off( 'next-item-click' );
		this.ui.off( 'wordinput-validate' );
		this.ui.off( 'retry-click' );
		for ( word in rw.records ) {
			rw.records[ word ].off( 'state-change' );
		}
		rw.controller.Step.prototype.unload.call( this );
	};

	/**
	 * Event handler called when an audio record has just started.
	 *
	 * @private
	 */
	rw.controller.Studio.prototype.onStart = function () {
		this.ui.onStart( this.currentWord );
	};

	/**
	 * Event handler called when an audio record has just ended.
	 *
	 * @param  {rw.libs.AudioRecord} audioRecord Object containing the audio datas
	 */
	rw.controller.Studio.prototype.onStop = function ( audioRecord ) {
		var currentWord = this.currentWord;

		this.upload( currentWord, audioRecord.getBlob() );

		if ( !this.startNextRecord() ) {
			this.isRecording = false;
			this.ui.onStop();
		}
	};

	/**
	 * Event handler called when an audio record has been canceled.
	 *
	 * @private
	 * @param  {string} reason Why has the record been canceled
	 */
	rw.controller.Studio.prototype.onCancel = function ( reason ) {
		if ( reason === 'saturated' ) {
			this.isRecording = false;
			this.startNextRecord();
		}
	};

	/**
	 * Event handler called when an audio record got saturated.
	 *
	 * @private
	 */
	rw.controller.Studio.prototype.onSaturate = function () {
		this.ui.onSaturate( this.currentWord );
	};

	/**
	 * Launch the upload to the stash of the given audio record.
	 *
	 * @param  {string} word textual transcription, must match an existing
	 *                       listed record object
	 * @param  {Blob} blob   WAVE-encoded audio file
	 */
	rw.controller.Studio.prototype.upload = function ( word, blob ) {
		if ( blob !== undefined ) {
			rw.records[ word ].setBlob( blob );
		}

		rw.requestQueue.push( rw.records[ word ], 'uploadToStash' );
	};

	/**
	 * Go to the next word in the list and start a new record for it.
	 *
	 * @return {boolean}  Whether a new record has started or not
	 */
	rw.controller.Studio.prototype.startNextRecord = function () {
		var index = rw.metadatas.words.indexOf( this.currentWord );

		if ( index < 0 ) {
			return false;
		}

		if ( this.isRecording ) {
			if ( index >= rw.metadatas.words.length - 1 ) {
				return false;
			}
			this.currentWord = rw.metadatas.words[ index + 1 ];
		}

		this.recorder.start();
		this.isRecording = true;

		this.ui.setSelectedItem( this.currentWord );
		return true;
	};

	/**
	 * Change the selected word.
	 *
	 * @param  {string} word textual transcription, must match an existing
	 *                       listed record object
	 */
	rw.controller.Studio.prototype.selectWord = function ( word ) {
		this.recorder.cancel();

		this.currentWord = word;

		if ( this.isRecording ) {
			this.isRecording = false;
			this.startNextRecord();
		} else {
			this.ui.setSelectedItem( word );
		}
	};

	/**
	 * @inheritDoc
	 */
	rw.controller.Studio.prototype.moveNext = function ( skipFirstWarning ) {
		var controller = this,
			total = rw.metadatas.statesCount.error + rw.metadatas.statesCount.stashed + rw.metadatas.statesCount.stashing;
		skipFirstWarning = skipFirstWarning || false;

		this.recorder.cancel();
		this.ui.onStop();
		console.log( rw.metadatas.statesCount );
		if ( total < rw.metadatas.words.length && !skipFirstWarning ) {
			OO.ui.confirm( mw.message( 'mwe-recwiz-warning-wordsleft' ).text() ).done( function ( confirmed ) {
				if ( confirmed ) {
					controller.moveNext( true );
				}
			} );
			return;
		}

		if ( rw.metadatas.statesCount.stashing > 0 ) {
			OO.ui.confirm( mw.message( 'mwe-recwiz-warning-pendinguploads' ).text() ).done( function ( confirmed ) {
				if ( confirmed ) {
					controller.removePendingRecords();
					rw.metadatas.statesCount.stashing = 0;
					controller.ui.updateCounter();
					controller.moveNext( true );
				}
			} );
			return;
		}

		if ( rw.metadatas.statesCount.error > 0 ) {
			OO.ui.confirm( mw.message( 'mwe-recwiz-warning-faileduploads' ).text() ).done( function ( confirmed ) {
				if ( confirmed ) {
					controller.removeFailedRecords();
					rw.metadatas.statesCount.error = 0;
					controller.ui.updateCounter();
					controller.moveNext( true );
				}
			} );
			return;
		}

		rw.controller.Step.prototype.moveNext.call( this );
	};

	/**
	 * @inheritDoc
	 */
	rw.controller.Studio.prototype.movePrevious = function () {
		// TODO: warning about a potential data loss

		rw.controller.Step.prototype.movePrevious.call( this );
	};

}( mediaWiki, mediaWiki.recordWizard, jQuery, OO ) );
