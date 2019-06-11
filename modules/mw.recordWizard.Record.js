'use strict';

// TODO: cleaner state managment
( function ( mw, rw, $ ) {

	/**
	 * Constructor for objects representing records.
	 *
	 * Records are first created without any sounds, just with it's textual
	 * transcription. It will then follow many steps and perform the needed API
	 * requests to see the audio record uploaded and sorted.
	 *
	 * @class rw.Record
	 * @mixins OO.EventEmitter
	 * @constructor
	 * @param  {string} word Textual transcription of the Record
	 */
	rw.Record = function ( word ) {
		var decomposedWord;

		OO.EventEmitter.call( this );

		this.file = null;
		this.filename = null;
		this.fileExtension = 'wav';
		this.filekey = null;
		this.imageInfo = null;
		this.wbItem = null;

		this.word = word;
		this.extra = {};
		this.date = new Date();

		decomposedWord = this.word.match( /^(.+) \((.+)\)$/m );
		if ( decomposedWord === null ) {
			this.transcription = this.word;
			this.qualifier = null;
		} else {
			this.transcription = decomposedWord[ 1 ];
			this.qualifier = decomposedWord[ 2 ];
		}

		this.inQueue = false;
		this.error = false;
		this.state = 'up';
	};

	OO.mixinClass( rw.Record, OO.EventEmitter );

	/**
	 * Get the full textual identifier of the record.
	 *
	 * @return {string}  Textual identifier of the record
	 */
	rw.Record.prototype.getWord = function () {
		return this.word;
	};

	/**
	 * Get the textual transcription of the record.
	 *
	 * @return {string}  Textual transcription of the record
	 */
	rw.Record.prototype.getTranscription = function () {
		return this.transcription;
	};

	/**
	 * Get the qualifier of the recorded word (if any).
	 *
	 * @return {string|null}  Qualifier of the record
	 */
	rw.Record.prototype.getQualifier = function () {
		return this.qualifier;
	};

	/**
	 * Get a WAVE-encoded blob containing the audio record.
	 *
	 * @return {Blob|null}  WAVE-encoded audio record.
	 */
	rw.Record.prototype.getBlob = function () {
		return this.file;
	};

	/**
	 * Get the current state of the record.
	 *
	 * Can be one of the following: 'up', 'ready', 'stashing', 'stashed',
	 * 'uploading', 'uploaded', 'finalizing', 'done', 'error'.
	 *
	 * @return {string}  State of the record
	 */
	rw.Record.prototype.getState = function () {
		return this.state;
	};

	/**
	 * Add extra wikibase statements.
	 *
	 * @param  {Object} extra Wikibase statements, in the format
	 *                        "PropertyId": "value".
	 */
	rw.Record.prototype.setExtra = function ( extra ) {
		this.extra = extra;
	};

	/**
	 * Set the current state of the record.
	 *
	 * It can be one of the following:
	 * * "up"           object created
	 * * "ready"        audio record available
	 * * "stashing"     stash request is pending
	 * * "stashed"      record is stashed
	 * * "uploading"    upload 2 commons request is pending
	 * * "uploaded"     record is uploaded on commons
	 * * "finalizing"   WB item creation request is pending
	 * * "done"         all has finished
	 *
	 * @private
	 * @param  {string} newState Name of the state the record should switch to
	 */
	rw.Record.prototype.setState = function ( newState ) {
		this.emit( 'state-change', this.getWord(), newState, this.state );
		this.state = newState;
	};

	/**
	 * Verify if the Record object has data.
	 *
	 * It is usefull to check if the current window can be closed safely or not.
	 *
	 * @return {boolean}  Whether the Record object has some data
	 */
	rw.Record.prototype.hasData = function () {
		if ( this.state === 'up' || this.state === 'done' ) {
			return false;
		}
		return true;
	};

	/**
	 * Get the url of the stashed file as indicated by MediaWiki
	 * or the uploaded file if already on Commons.
	 *
	 * @return {string|null}  Url of the stashed file
	 */
	rw.Record.prototype.getMediaUrl = function () {
		if ( this.filekey !== null ) {
			return mw.util.getUrl( 'Special:UploadStash/file/' + this.filekey );
		} else if ( this.imageInfo !== null ) {
			return this.imageInfo.url;
		}
		return '';
	};

	/**
	 * Generate a filename for this record based on the curent metadatas.
	 *
	 * The format looks like 'LL-Username (locutor)-lang-transcription.wav'.
	 * All illegal characters are replaced by a dash, see for reference:
	 * https://www.mediawiki.org/wiki/Manual:$wgIllegalFileChars
	 *
	 * @return {string}  Name to give to this record
	 */
	rw.Record.prototype.getFilename = function () {
		var lang = rw.config.languages[ rw.metadatas.language ],
			illegalChars = /[#<>[\]|{}:/\\]/g,
			filename = 'LL' +
				'-' + lang.wikidataId +
				( lang.iso3 !== null ? ' (' + lang.iso3 + ')' : '' ) +
				'-' + rw.metadatas.locutor.name +
				( mw.config.get( 'wgUserName' ) !== rw.metadatas.locutor.name ? ' (' + mw.config.get( 'wgUserName' ) + ')' : '' ) +
				'-' + this.word + '.' + this.fileExtension;

		return filename.replace( illegalChars, '-' );
	};

	/**
	 * Generate the wikitext for the description of the record
	 * on Wikimedia Commons.
	 *
	 * @return {string}  Description of the record
	 */
	rw.Record.prototype.getText = function () {
		var gender = '';
		switch ( rw.metadatas.locutor.gender ) {
			case rw.config.items.genderMale:
				gender = 'male';
				break;
			case rw.config.items.genderFemale:
				gender = 'female';
				break;
			case rw.config.items.genderOther:
				gender = 'other';
				break;
		}
		return '== {{int:filedesc}} ==' +
			'\n{{Lingua Libre record' +
			'\n | locutor       = ' + rw.metadatas.locutor.name +
			'\n | locutorId     = ' + rw.metadatas.locutor.qid +
			'\n | locutorGender = ' + gender +
			'\n | author        = [[User:' + mw.config.get( 'wgUserName' ) + '|]]' +
			'\n | languageId    = ' + rw.config.languages[ rw.metadatas.language ].wikidataId +
			'\n | transcription = ' + this.transcription +
			'\n | qualifier     = ' + ( this.qualifier !== null ? this.qualifier : '' ) +
			'\n | date          = ' + this.date.getFullYear() + '-' + ( ( '0' + ( this.date.getMonth() + 1 ) ).slice( -2 ) ) + '-' + ( '0' + this.date.getDate() ).slice( -2 ) +
			'\n}}' +
			'\n\n== {{int:license-header}} ==' +
			'\n{{' + rw.metadatas.license + '}}';
	};

	/**
	 * Get the internal file key of the record file.
	 *
	 * This is only set after the 'stashed' state is reached.
	 *
	 * @return {string|null}  File key of the record
	 */
	rw.Record.prototype.getFilekey = function () {
		return this.filekey;
	};

	/**
	 * Set the internal stash filekey of this record.
	 *
	 * This method is called when the file has been successfully stashed.
	 *
	 * @private
	 * @param  {string} filekey Filekey of this record file
	 */
	rw.Record.prototype.setFilekey = function ( filekey ) {
		this.filekey = filekey;
		this.file = null;
		this.setState( 'stashed' );
	};

	/**
	 * Switch to the "uploaded" state, once the upload is successful.
	 *
	 * @private
	 * @param  {Object} imageinfo Imageinfo object returned by the Api
	 */
	rw.Record.prototype.uploaded = function ( imageinfo ) {
		this.imageInfo = imageinfo;
		this.filekey = null;
		this.setState( 'uploaded' );
	};

	/**
	 * Switch the record to the error state.
	 *
	 * @private
	 * @param  {type} error Message explaining the error.
	 */
	rw.Record.prototype.setError = function ( error ) {
		this.error = error;
		this.setState( 'error' );
	};

	/**
	 * Check whether the record is a video or not.
	 *
	 * @return {boolean}  true means the media is a video
	 */
	rw.Record.prototype.isVideo = function () {
		if ( this.fileExtension === 'webm' ) {
			return true;
		}
		return false;
	};

	/**
	 * Check whether the record is in error or not.
	 *
	 * @return {boolean}  Whether an error occured
	 */
	rw.Record.prototype.hasFailed = function () {
		if ( this.state === 'error' ) {
			return true;
		}
		return false;
	};

	/**
	 * Check if the record is in the request queue, or change it's state.
	 *
	 * @param  {boolean|undefined} inQueue if set, change the inQueue value
	 * @return {type}                      Whether the record is in the request
	 *                                     queue
	 */
	rw.Record.prototype.isInQueue = function ( inQueue ) {
		if ( inQueue !== undefined ) {
			this.inQueue = inQueue;
		}
		return this.inQueue;
	};

	/**
	 * Add an audio file to this record.
	 *
	 * @param  {Blob} audioBlob WAVE-encoded Blob containing the audio file
	 * @param  {string} extension file extension
	 * @return {boolean}        Whether the audio file has been set correctly
	 */
	rw.Record.prototype.setBlob = function ( audioBlob, extension ) {
		// Only allow re-recording an audio when it's not already uploaded
		if ( [ 'up', 'ready', 'stashing', 'stashed' ].indexOf( this.state ) > -1 ) {
			this.setState( 'ready' );
			this.filekey = null;
			this.fileExtension = extension;
			this.error = false;

			this.file = audioBlob;

			return true;
		}
		return false;
	};

	/**
	 * Clear locally the audio record file.
	 */
	rw.Record.prototype.remove = function () {
		this.file = null;

		// Cancel any pending request
		if ( this.deferred !== undefined ) {
			this.deferred.reject( 'cancel' );
		}
	};

	/**
	 * Reset the object
	 */
	rw.Record.prototype.reset = function () {
		this.file = null;
		this.filekey = null;
		this.imageInfo = null;
		this.error = false;
		this.setState( 'up' );

		// Cancel any pending request
		if ( this.deferred !== undefined ) {
			this.deferred.reject( 'cancel' );
		}
	};

	/**
	 * Upload the audio file to the upload stash.
	 *
	 * This method is made to be used through the request queue.
	 *
	 * @param  {mw.Api} api          Api object to use for the request
	 * @param  {$.Deferred} deferred A promise, to resolv when we're done
	 */
	rw.Record.prototype.uploadToStash = function ( api, deferred ) {
		var record = this;
		if ( this.state === 'ready' || this.state === 'error' ) {
			this.setState( 'stashing' );

			this.deferred = deferred;

			api.upload( this.file, {
				stash: true,
				filename: this.getFilename()
			} ).then( deferred.resolve.bind( deferred ), deferred.reject.bind( deferred ) );

			this.deferred.then( function ( result ) {
				record.setFilekey( result.upload.filekey );
			}, function ( errorCode ) {
				if ( errorCode !== 'cancel' ) {
					record.setError( errorCode );
				}
			} );
		}
	};

	/**
	 * Push the audio file from the upload stash to Wikimedia Commons.
	 *
	 * This method is made to be used through the request queue.
	 *
	 * @param  {mw.Api} api          Api object to use for the request
	 * @param  {$.Deferred} deferred A promise, to resolv when we're done
	 */
	rw.Record.prototype.finishUpload = function ( api, deferred ) {
		var record = this;

		if ( this.state === 'error' && this.imageInfo !== null ) {
			deferred.resolve();
			return;
		}

		this.setState( 'uploading' );

		this.deferred = deferred;

		api.postWithToken( 'csrf', {
			action: 'upload-to-commons',
			format: 'json',
			filekey: this.getFilekey(),
			filename: this.getFilename(),
			text: this.getText(),
			ignorewarnings: true // TODO: manage warnings !important
		} ).then( deferred.resolve.bind( deferred ), deferred.reject.bind( deferred ) );

		this.deferred.then( function ( result ) {
			record.uploaded( result[ 'upload-to-commons' ].oauth.upload.imageinfo );
		}, function ( errorCode ) {
			if ( errorCode !== 'cancel' ) {
				record.setError( errorCode );
			}
		} );
	};

	/**
	 * Create a Wikibase item for our record on our local repository.
	 *
	 * @param  {mw.Api} api  Api object to use for the request
	 * @return {$.Deferred}  A promise, resolved when we're done
	 */
	rw.Record.prototype.saveWbItem = function ( api ) {
		var record = this;

		this.setState( 'finalizing' );

		this.wbItem = new rw.wikibase.Item();
		this.fillWbItem();

		return this.wbItem.createOrUpdate( api, true ).then( function () {
			record.setState( 'done' );
		} ).fail( function ( code ) {
			record.setError( code );
		} );
	};

	/**
	 * Fill the record's wikibase item with all known metadatas on it.
	 */
	rw.Record.prototype.fillWbItem = function () {
		var propertyId, lang, date;

		this.date.setUTCHours( 0, 0, 0, 0 );
		date = this.date.toISOString().slice( 0, -5 ) + 'Z';

		this.wbItem.labels = { en: this.word };

		lang = rw.config.languages[ rw.metadatas.language ];
		this.wbItem.descriptions = { en: 'audio record - ' + ( lang.iso3 !== null ? lang.iso3 : lang.wikidataId ) + ' - ' + rw.metadatas.locutor.name + ' (' + mw.config.get( 'wgUserName' ) + ')' };

		this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.instanceOf ).setType( 'wikibase-item' ).setValue( rw.config.items.record ), true ); // InstanceOf
		this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.subclassOf ).setType( 'wikibase-item' ).setValue( rw.config.items.word ), true ); // SubclassOf
		if ( mw.Debug === undefined ) { // Disable media on the dev environment
			this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.audioRecord ).setType( 'commonsMedia' ).setValue( this.getFilename() ), true ); // Audio file
		}
		this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.spokenLanguages ).setType( 'wikibase-item' ).setValue( rw.metadatas.language ), true ); // Language
		this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.locutor ).setType( 'wikibase-item' ).setValue( rw.metadatas.locutor.qid ), true ); // Locutor
		this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.date ).setType( 'time' ).setValue( { time: date } ), true ); // Date
		this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.transcription ).setType( 'string' ).setValue( this.transcription ), true ); // Transcription
		if ( this.qualifier !== null ) {
			this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( rw.config.properties.qualifier ).setType( 'string' ).setValue( this.qualifier ), true ); // Qualifier
		}

		for ( propertyId in this.extra ) {
			this.wbItem.addOrReplaceStatements( new rw.wikibase.Statement( propertyId ).setType( 'string' ).setValue( this.extra[ propertyId ] ), true );
		}
	};

}( mediaWiki, mediaWiki.recordWizard, jQuery ) );
