'use strict';

( function ( mw, rw, $, OO ) {
	/**
	 * The Locutor step.
	 *
	 * @class rw.controller.Locutor
	 * @extends mw.recordWizard.controller.Step
	 * @constructor
	 * @param {mw.Api} api     API instance to perform requests
	 * @param {Object} config  RecordWizard config object.
	 */
	rw.controller.Locutor = function ( api, config ) {
		rw.controller.Step.call(
			this,
			new rw.ui.Locutor(),
			api,
			config
		);

		this.stepName = 'locutor';
	};

	OO.inheritClass( rw.controller.Locutor, rw.controller.Step );

	/**
	 * @inheritDoc
	 */
	rw.controller.Locutor.prototype.load = function () {
		if ( rw.metadatas.locutor === undefined ) {
			rw.metadatas.locutor = {};
		}

		rw.controller.Step.prototype.load.call( this );

		this.ui.on( 'profile-change', this.onProfileChange.bind( this ) );
	};

	/**
	 * Event handler, called when the user changes the selected profile.
	 *
	 * @private
	 * @param  {string} locutorQid Qid of the newly selected locutor
	 */
	rw.controller.Locutor.prototype.onProfileChange = function ( locutorQid ) {
		var locutor = {};
		if ( locutorQid === rw.config.locutor.qid || locutorQid === '*' ) {
			locutor = rw.config.locutor;
		} else if ( locutorQid[ 0 ] === 'Q' ) {
			locutor = rw.config.otherLocutors[ locutorQid ];
		}

		this.ui.populateProfile( locutor );
	};

	/**
	 * @inheritDoc
	 */
	rw.controller.Locutor.prototype.moveNext = function () {
		var qid,
			controller = this,
			process = new OO.ui.Process();

		this.ui.collect();
		if ( rw.metadatas.locutor.name === '' ) {
			OO.ui.alert( mw.msg( 'mwe-recwiz-error-noname' ) );
			return;
		}
		if ( rw.metadatas.locutor.name === rw.config.locutor.name && rw.metadatas.locutor.main !== true ) {
			OO.ui.alert( mw.msg( 'mwe-recwiz-error-duplicatename', rw.metadatas.locutor.name ) );
			return;
		}
		for ( qid in rw.config.otherLocutors ) {
			if ( rw.metadatas.locutor.name === rw.config.otherLocutors[ qid ].name && rw.metadatas.locutor.qid !== qid ) {
				OO.ui.alert( mw.msg( 'mwe-recwiz-error-duplicatename', rw.metadatas.locutor.name ) );
				return;
			}
		}
		if ( Object.keys( rw.metadatas.locutor.languages ).length === 0 ) {
			OO.ui.alert( mw.msg( 'mwe-recwiz-error-nolanguages' ) );
			return;
		}

		this.wbItem = new mw.recordWizard.wikibase.Item();

		process.next( this.ui.lockUI, this.ui );

		if ( !rw.metadatas.locutor.new ) {
			process.next( this.getExistingWbItem, this ); // get the existing item
		}

		process.next( this.fillWbItem, this ); // save the formed item
		process.next( this.createOrUpdateWbItem, this ); // save the formed item
		process.next( this.updateConfig, this ); // update recordWizard's locutors config
		process.next( this.saveOptions, this ); // save options
		process.next( rw.controller.Step.prototype.moveNext, this ); // go next

		process.execute().fail( function ( code, data ) {
				controller.ui.unlockUI();
				// If the user reset its parameters, the RecordWizard will consider it is a new user, and will try to create him/her a new item
				// A conflict will be raised with his original speaker item, so restart the process with this item.
				// It would be better if the speaker item id is tored in a more reliable place than the user preferences, see T212423
				if ( data.errors !== undefined && data.errors.length > 0 && data.errors[ 0 ].key === 'wikibase-validator-label-with-description-conflict' ) {
						delete rw.metadatas.locutor.new;
						// data.errors[ 0 ].params[ 2 ] contains the conflicting item in the form "[[Qxxxx|Qxxxx]]"
						rw.metadatas.locutor.qid = data.errors[ 0 ].params[ 2 ].split( '|' )[ 0 ].substring( 2 );
						if ( rw.metadatas.locutor.main === true ) {
								rw.config.locutor = rw.metadatas.locutor;
						} else {
								rw.config.otherLocutors[ rw.metadatas.locutor.qid ] = rw.metadatas.locutor;
						}
						controller.ui.profilePicker.getMenu().getSelectedItem().setData( rw.metadatas.locutor.qid );
						controller.moveNext();
				} else {
						OO.ui.alert( mw.msg( 'mwe-recwiz-error-network' ) );
				}
		} );
	};

	/**
	 * Get the Wikibase Item of the selected locutor through the API.
	 *
	 * @return {$.Deferred}  A promise, resolved when we're done
	 */
	rw.controller.Locutor.prototype.getExistingWbItem = function () {
		return this.wbItem.setId( rw.metadatas.locutor.qid ).getFromApi( this.api );
	};

	/**
	 * Fill the Wikibase item of the locutor with the values given by the UI.
	 */
	rw.controller.Locutor.prototype.fillWbItem = function () {
		var qid,
			name = rw.metadatas.locutor.name,
			gender = rw.metadatas.locutor.gender,
			location = rw.metadatas.locutor.location,
			languages = rw.metadatas.locutor.languages,
			instanceOfStatement = new mw.recordWizard.wikibase.Statement( rw.config.properties.instanceOf ).setType( 'wikibase-item' ).setValue( rw.config.items.locutor ),
			userStatement = new mw.recordWizard.wikibase.Statement( rw.config.properties.linkedUser ).setType( 'external-id' ).setValue( mw.config.get( 'wgUserName' ) ).setRank( 2 ),
			locationStatement = new mw.recordWizard.wikibase.Statement( rw.config.properties.residencePlace ),
			genderStatement = new mw.recordWizard.wikibase.Statement( rw.config.properties.gender ),
			languageStatements = [];

		this.wbItem.labels = { en: name };
		this.wbItem.descriptions = { en: 'locutor of the user "' + mw.config.get( 'wgUserName' ) + '"' };

		locationStatement.setType( location === '' ? 'somevalue' : 'external-id' ).setValue( location );
		genderStatement.setType( gender === null ? 'somevalue' : 'wikibase-item' ).setValue( gender );

		this.wbItem.addOrReplaceStatements( instanceOfStatement, true );
		this.wbItem.addOrReplaceStatements( userStatement, true );
		this.wbItem.addOrReplaceStatements( locationStatement, true );
		this.wbItem.addOrReplaceStatements( genderStatement, true );

		for ( qid in languages ) {
			languageStatements.push( new mw.recordWizard.wikibase.Statement( rw.config.properties.spokenLanguages )
				.setType( 'wikibase-item' )
				.setValue( qid )
				.addQualifier( new mw.recordWizard.wikibase.Snak(
					rw.config.properties.languageLevel,
					'wikibase-item',
					languages[ qid ].languageLevel
				) )
				.addQualifier( new mw.recordWizard.wikibase.Snak(
					rw.config.properties.learningPlace,
					'external-id',
					languages[ qid ].location
				) )
			);
		}
		this.wbItem.addOrReplaceStatements( languageStatements, true );
	};

	/**
	 * Save the Wikibase item (update it if it already exists, create it if not)
	 *
	 * @return {$.Deferred}  A promise, resolved when we're done
	 */
	rw.controller.Locutor.prototype.createOrUpdateWbItem = function () {
		return this.wbItem.createOrUpdate( this.api )
			.then( function ( data ) {
				rw.metadatas.locutor.qid = data.entity.id;
			} )
			.fail( function ( code, data ) {
				console.log( code );
				console.log( data );
			// TODO: manage errors
			} );
	};

	/**
	 * Update the global config with the new informations we got on the locutor.
	 */
	rw.controller.Locutor.prototype.updateConfig = function () {
		if ( rw.metadatas.locutor.main ) {
			rw.config.locutor = rw.metadatas.locutor;
		} else {
			rw.config.otherLocutors[ rw.metadatas.locutor.qid ] = rw.metadatas.locutor;
		}
	};

	/**
	 * Save some options in a personal subpage.
	 *
	 * This includes the main locutor Qid, all the secondary locutors Qid, and
	 * the preferred license. This will allow to preload those data at the next
	 * use of the RecordWizard.
	 *
	 * @return {$.Deferred}  A promise, resolved when we're done
	 */
	rw.controller.Locutor.prototype.saveOptions = function () {
		var userConfig = {
			locutor: rw.config.locutor.qid,
			otherLocutors: Object.keys( rw.config.otherLocutors ),
			license: rw.metadatas.license
		};
		return this.api.postWithToken( 'csrf', {
			action: 'edit',
			format: 'json',
			title: 'User:' + mw.config.get( 'wgUserName' ) + '/RecordWizard.json',
			text: JSON.stringify( userConfig ),
			summary: 'personal config update',
			recreate: 1
		} ).fail( function () {
			// TODO: manage errors
		} );
	};

}( mediaWiki, mediaWiki.recordWizard, jQuery, OO ) );
