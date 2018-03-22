// TODO: cleaner state managment
( function ( mw, rw, $ ) {

	rw.Record = function ( word ) {
		OO.EventEmitter.call( this );

		this.file = null;
		this.filename = null;
		this.filekey = null;
		this.imageInfo = null;
		this.word = word;
		this.extra = {};

        this.inQueue = false;
        this.error = false;
		this.state = 'up';
	};

	OO.mixinClass( rw.Record, OO.EventEmitter );

	rw.Record.prototype.getWord = function() {
	    return this.word;
	};

	rw.Record.prototype.getBlob = function() {
	    return this.file;
	};

	rw.Record.prototype.getState = function() {
	    return this.state;
	};

	rw.Record.prototype.setExtra = function( extra ) {
	    this.extra = extra;
	};

	// up				object created
	// ready			audio record available
	// stashing			stash request is pending
	// stashed			record is stashed
	// uploading		upload 2 commons request is pending
	// uploaded			record is uploaded on commons
	// finalizing		WB item creation request is pending
	// done				all has finished
	rw.Record.prototype.setState = function( newState ) {
	    this.emit( 'state-change', this.getWord(), newState, this.state );
	    this.state = newState;
	};

	rw.Record.prototype.hasData = function() {
	    if ( this.state === 'up' || this.state === 'done' ) {
	    	return false;
	    }
	    return true;
	};

	rw.Record.prototype.getStashedFileUrl = function() {
	    if ( this.filekey !== null ) {
	        return mw.util.getUrl( 'Special:UploadStash/file/' + this.filekey );
	    }
	    return null;
	};

	rw.Record.prototype.getFilename = function() {
	    if ( this.filename === null ) {
	        // TODO: add language name/code
	        this.filename = mw.config.get( 'wgUserName' ) + '-' + this.word + '.wav';
	    }
	    return this.filename;
	};

	rw.Record.prototype.getText = function() {
	    // TODO: generate real description based on metadatas and a configured template
	    return 'The word \'\'' + this.word + '\'\' pronounced by ' + mw.config.get( 'wgUserName' ) + '.\n\n'
	    	+ JSON.stringify( this.extra );
	};

	rw.Record.prototype.getFilekey = function() {
	    return this.filekey;
	};

	rw.Record.prototype.setFilekey = function( filekey ) {
	    this.filekey = filekey;
	    this.file = null;
	    this.setState( 'stashed' );
	};

	rw.Record.prototype.uploaded = function( imageinfo ) {
	    this.imageInfo = imageinfo;
	    this.filekey = null;
	    this.setState( 'uploaded' );
	};

	rw.Record.prototype.setError = function( error ) {
	    this.error = error;
	    this.setState( 'error' );
	};

	rw.Record.prototype.hasFailed = function() {
	    if ( this.state === 'error' ) {
	        return true;
	    }
	    return false;
	};

	rw.Record.prototype.setBlob = function( audioBlob ) {
	    // Only allow re-recording an audio when it's not already uploaded
	    if ( [ 'up', 'ready', 'stashing', 'stashed' ].indexOf( this.state ) > -1 ) {
	        this.setState( 'ready' );
		    this.filekey = null;
	        this.error = false;

	        this.file = audioBlob;

	        return true;
	    }
	    return false;
	};

	rw.Record.prototype.isInQueue = function ( inQueue ) {
	    if ( inQueue !== undefined ) {
	        this.inQueue = inQueue;
	    }
	    return this.inQueue;
	};

	rw.Record.prototype.remove = function () {
	    // TODO: abort request if uploading
	    //this.offStateChange();
        this.file = null;
	};

    rw.Record.prototype.uploadToStash = function( api, deferred ) {
        var record = this;
        if ( this.state === 'ready' || this.state === 'error' ) {
            this.setState( 'stashing' );

	        api.upload( this.file, {
	            stash: true,
	            filename: this.getFilename()
	        } ).then( function( result ) {
                record.setFilekey( result.upload.filekey );
                deferred.resolve( result );
            } ).fail( function( errorCode, result ) {
                deferred.reject( errorCode, result );
                record.setError( errorCode );
            } );
        }
	};

	rw.Record.prototype.finishUpload = function( api, deferred ) {
        var record = this;

        if ( this.state === 'error' && this.imageInfo !== null ) {
        	return this.createWikibaseItem( api, deferred );
        }

        this.setState( 'uploading' );

        // TODO: switch from upload to upload-to-commons, if available
        // use the config to detect it
        api.postWithToken( 'csrf', {
            action: 'upload-to-commons',
            format: 'json',
            filekey: this.getFilekey(),
            filename: this.getFilename(),
            text: this.getText(),
            removeafterupload: true,
            ignorewarnings: true, //TODO: manage warnings
        } ).then( function( result ) {
            record.uploaded( result['upload-to-commons'].oauth.upload.imageinfo );
            record.createWikibaseItem( api, deferred );
        } ).fail( function( errorCode, result ) {
            deferred.reject( errorCode, result );
            record.setError( errorCode );
        } );
	};

	rw.Record.prototype.createWikibaseItem = function( api, deferred ) {
        var record = this;
        this.setState( 'finalizing' );

        var today = new Date();
		today.setUTCHours(0,0,0,0);
		today = today.toISOString().slice(0,-5)+'Z';

		var item = new mw.recordWizard.wikibase.Item();
		//TODO: manage other languages
		item.labels = { en: this.word };
		//TODO: add language information
		item.descriptions = { en: 'audio record from' + rw.metadatas.locutor.name + '(' + mw.config.get( 'wgUserName' ) + ')' };

		//TODO: make property and item configuration-dependant, and not hardcoded
		item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( 'P2' ).setType( 'wikibase-item' ).setValue( 'Q2' ), true ); //InstanceOf
		item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( 'P19' ).setType( 'wikibase-item' ).setValue( 'Q30' ), true ); //SubclassOf
		//item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( 'P3' ).setType( 'commonsMedia' ).setValue( this.getFilename() ), true ); //Audio file
		item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( 'P4' ).setType( 'wikibase-item' ).setValue( rw.metadatas.language ), true ); //Language
		item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( 'P5' ).setType( 'wikibase-item' ).setValue( rw.metadatas.locutor.qid ), true ); //Locutor
		item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( 'P7' ).setType( 'time' ).setValue( { time: today } ), true ); //Date
		item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( 'P8' ).setType( 'monolingualtext' ).setValue( { language: 'fr', text: this.word } ), true ); //Transcription
		for ( propertyId in this.extra ) {
			item.addOrReplaceStatements( new mw.recordWizard.wikibase.Statement( propertyId ).setType( 'string' ).setValue( this.extra[ propertyId ] ), true );
		}
		console.log( item.serialize() );
		var repoApi = new wb.api.RepoApi( api );
		repoApi.createEntity( 'item', item.serialize() )
		.then( function( data ) {
			//TODO: change state
			record.qid = data.entity.id;
			record.setState( 'done' );
			deferred.resolve();
		} )
		.fail( function( errorCode, result ) {
			console.log( errorCode );
			console.log( result );
            deferred.reject( errorCode, result );
            record.setError( errorCode );
		} );
	};

}( mediaWiki, mediaWiki.recordWizard, jQuery ) );

