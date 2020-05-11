'use strict';

( function ( mw, rw, OO ) {
	/**
	 * The Locutor step.
	 */
	rw.vue.locutor = new Vue( {
		mixins: [ rw.vue.step ],

		/* Data */
		data: {
			profiles: [],
			metadata: rw.store.record.data.metadata,
			genderOptions: [ {
				data: rw.store.config.data.items.genderMale,
				label: mw.msg( 'mwe-recwiz-gender-male' )
			},
			{
				data: rw.store.config.data.items.genderFemale,
				label: mw.msg( 'mwe-recwiz-gender-female' )
			},
			{
				data: rw.store.config.data.items.genderOther,
				label: mw.msg( 'mwe-recwiz-gender-other' )
			}
			],
			availableLanguages: [],
			availableLicenses: []
		},

		/* Hooks */
		created: function () {
			var qid, code;

			/* Fill profiles */
			this.profiles.push( {
				optgroup: mw.msg( 'mwe-recwiz-locutor-profilemain' )
			} );
			this.profiles.push( {
				data: this.config.locutor.qid || '*',
				label: this.config.locutor.name
			} );
			this.profiles.push( {
				optgroup: mw.msg( 'mwe-recwiz-locutor-profileother' )
			} );
			for ( qid in this.config.otherLocutors ) {
				this.profiles.push( {
					data: qid,
					label: this.config.otherLocutors[ qid ].name
				} );
			}
			this.profiles.push( {
				data: '+',
				label: mw.msg( 'mwe-recwiz-locutor-profilenew' )
			} );

			/* Fill all fields with the default locutor datas */
			rw.store.record.setLocutor( this.config.locutor );

			/* Set available languages */
			for ( code in this.config.languages ) {
				this.availableLanguages.push( {
					data: this.config.languages[ code ].qid,
					label: this.config.languages[ code ].localname
				} );
			}

			/* Set available licenses from data comming from [[Special:Licenses]] */
			this.buildLicenses( this.config.licenses );
		},
		mounted: function () {},
		beforeUpdate: function () {

		},
		updated: function () {

		},

		/* Methods */
		watch: {
			'metadata.locutor.qid': function () {
				if ( this.metadata.locutor.qid === this.config.locutor.qid || this.metadata.locutor.qid === '*' ) {
					rw.store.record.setLocutor( this.config.locutor );
				} else if ( this.metadata.locutor.qid[ 0 ] === 'Q' ) {
					rw.store.record.setLocutor( this.config.otherLocutors[ this.metadata.locutor.qid ] );
				} else {
					rw.store.record.setLocutor( {
						qid: '+',
						new: true
					} );
				}
			},
			'metadata.locutor.name': function () {
				var i;

				if ( this.metadata.locutor.new === true ) {
					return;
				}

				for ( i = 0; i < this.profiles.length; i++ ) {
					if ( this.profiles[ i ].data === this.metadata.locutor.qid ) {
						this.profiles[ i ].label = this.metadata.locutor.name;
					}
				}
			}
		},
		computed: {
			licenseText: function () {
				return mw.msg( 'mwe-recwiz-locutor-licensecontent', this.metadata.locutor.name );
			}
		},
		methods: {
			buildLicenses: function ( node ) {
				var i, key;

				if ( node.template !== undefined ) {
					node = [ node ];
				}
				if ( Array.isArray( node ) ) {
					for ( i = 0; i < node.length; i++ ) {
						this.availableLicenses.push( {
							label: node[ i ].text,
							data: node[ i ].template
						} );
					}
				} else {
					for ( key in node ) {
						this.buildLicenses( node[ key ] );
					}
				}
			},
			canMoveNext: function () {
				var qid, deferred,
					process = new OO.ui.Process();

				/* Validate the datas */
				if ( this.metadata.locutor.name === '' ) {
					OO.ui.alert( mw.msg( 'mwe-recwiz-error-noname' ) );
					return false;
				}
				if ( this.metadata.locutor.name === this.config.locutor.name && this.metadata.locutor.main !== true ) {
					OO.ui.alert( mw.msg( 'mwe-recwiz-error-duplicatename', this.metadata.locutor.name ) );
					return false;
				}
				for ( qid in this.config.otherLocutors ) {
					if ( this.metadata.locutor.name === this.config.otherLocutors[ qid ].name && this.metadata.locutor.qid !== qid ) {
						OO.ui.alert( mw.msg( 'mwe-recwiz-error-duplicatename', this.metadata.locutor.name ) );
						return false;
					}
				}
				if ( Object.keys( this.metadata.locutor.languages ).length === 0 ) {
					OO.ui.alert( mw.msg( 'mwe-recwiz-error-nolanguages' ) );
					return false;
				}

				/* Create or update the locutor item in the wikibase */
				this.$wbItem = new mw.recordWizard.wikibase.Item();

				if ( this.metadata.locutor.new === false ) {
					process.next( this.getExistingWbItem, this ); // get the existing item
				}

				process.next( this.fillWbItem, this ); // save the formed item
				process.next( this.createOrUpdateWbItem, this ); // save the formed item
				process.next( this.saveOptions, this ); // save options

				deferred = process.execute();
				deferred.fail( function ( code, data ) {
					console.error( '[RecordWizard]', code, data );
					OO.ui.alert( mw.msg( 'mwe-recwiz-error-network' ) );
				} );

				return deferred;
			},

			/**
			 * Get the Wikibase Item of the selected locutor through the API.
			 *
			 * @return {$.Deferred}  A promise, resolved when we're done
			 */
			getExistingWbItem: function () {
				return this.$wbItem.setId( this.metadata.locutor.qid ).getFromApi( this.$api );
			},

			/**
			 * Fill the Wikibase item of the locutor with the values given by the UI.
			 */
			fillWbItem: function () {
				var qid,
					name = this.metadata.locutor.name,
					gender = this.metadata.locutor.gender,
					location = this.metadata.locutor.location,
					languages = this.metadata.locutor.languages,
					instanceOfStatement = new mw.recordWizard.wikibase.Statement( this.config.properties.instanceOf ).setType( 'wikibase-item' ).setValue( this.config.items.locutor ),
					userStatement = new mw.recordWizard.wikibase.Statement( this.config.properties.linkedUser ).setType( 'external-id' ).setValue( mw.config.get( 'wgUserName' ) ).setRank( 2 ),
					locationStatement = new mw.recordWizard.wikibase.Statement( this.config.properties.residencePlace ),
					genderStatement = new mw.recordWizard.wikibase.Statement( this.config.properties.gender ),
					languageStatements = [];

				this.$wbItem.labels = {
					en: name
				};
				this.$wbItem.descriptions = {
					en: 'locutor of the user "' + mw.config.get( 'wgUserName' ) + '"'
				};

				locationStatement.setType( location === '' ? 'somevalue' : 'external-id' ).setValue( location );
				genderStatement.setType( gender === null ? 'somevalue' : 'wikibase-item' ).setValue( gender );

				this.$wbItem.addOrReplaceStatements( instanceOfStatement, true );
				this.$wbItem.addOrReplaceStatements( userStatement, true );
				this.$wbItem.addOrReplaceStatements( locationStatement, true );
				this.$wbItem.addOrReplaceStatements( genderStatement, true );

				for ( qid in languages ) {
					languageStatements.push( new mw.recordWizard.wikibase.Statement( this.config.properties.spokenLanguages )
						.setType( 'wikibase-item' )
						.setValue( qid )
						.addQualifier( new mw.recordWizard.wikibase.Snak(
							this.config.properties.languageLevel,
							'wikibase-item',
							languages[ qid ].languageLevel
						) )
						.addQualifier( new mw.recordWizard.wikibase.Snak(
							this.config.properties.learningPlace,
							'external-id',
							languages[ qid ].location
						) )
					);
				}
				this.$wbItem.addOrReplaceStatements( languageStatements, true );
			},

			/**
			 * Save the Wikibase item (update it if it already exists, create it if not)
			 *
			 * @return {$.Deferred}  A promise, resolved when we're done
			 */
			createOrUpdateWbItem: function () {
				return this.$wbItem.createOrUpdate( this.$api ).then( this.updateConfig.bind( this ) );
			},

			/**
			 * Update the global config with the new informations we got on the locutor.
			 *
			 * @param {Object} data Information returned by the wikibase API
			 */
			updateConfig: function ( data ) {
				/* Update the config */
				if ( this.metadata.locutor.main === true ) {
					this.metadata.locutor.new = false;
					this.config.locutor = $.extend( true, {}, this.metadata.locutor, {
						qid: data.entity.id
					} );
				} else {
					/* Update available profiles */
					if ( this.metadata.locutor.new === true ) {
						this.profiles.splice( this.profiles.length - 1, 0, {
							data: data.entity.id,
							label: this.metadata.locutor.name
						} );
					}

					this.metadata.locutor.new = false;
					this.config.otherLocutors[ data.entity.id ] = $.extend( true, {}, this.metadata.locutor, {
						qid: data.entity.id
					} );
				}
				this.metadata.locutor.qid = data.entity.id;
			},

			/**
			 * Save some options in a personal subpage.
			 *
			 * This includes the main locutor Qid, all the secondary locutors Qid, and
			 * the preferred license. This will allow to preload those data at the next
			 * use of the RecordWizard.
			 *
			 * @return {$.Deferred}  A promise, resolved when we're done
			 */
			saveOptions: function () {
				var userConfig = {
					locutor: this.config.locutor.qid,
					otherLocutors: Object.keys( this.config.otherLocutors ),
					license: this.metadata.license
				};
				return this.$api.postWithToken( 'csrf', {
					action: 'edit',
					format: 'json',
					title: 'User:' + mw.config.get( 'wgUserName' ) + '/RecordWizard.json',
					text: JSON.stringify( userConfig ),
					summary: 'personal config update',
					recreate: 1
				} ).fail( function () {
					// TODO: manage errors
				} );
			}
		}
	} );

}( mediaWiki, mediaWiki.recordWizard, OO ) );
