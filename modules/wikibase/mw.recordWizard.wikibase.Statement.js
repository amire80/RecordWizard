( function ( mw, $, rw, wb ) {

	rw.wikibase.Statement = function( propertyId, GUID ) {
		this.GUID = GUID || null;
		this.mainSnak = new rw.wikibase.Snak();
		this.mainSnak.setPropertyId( propertyId );
		this.qualifiers = [];
		this.references = [];
		this.rank = 1;
	};

	rw.wikibase.Statement.prototype.getGUID = function() {
		return this.GUID;
	};

	rw.wikibase.Statement.prototype.setGUID = function( GUID ) {
		this.GUID = GUID;
	};

	rw.wikibase.Statement.prototype.getMainSnak = function() {
		return this.mainSnak;
	};

	rw.wikibase.Statement.prototype.getPropertyId = function() {
		return this.mainSnak.getPropertyId();
	};

	rw.wikibase.Statement.prototype.getType = function() {
		return this.mainSnak.getType();
	};

	rw.wikibase.Statement.prototype.getValue = function() {
		return this.mainSnak.getValue();
	};

	rw.wikibase.Statement.prototype.setMainSnak = function( snak ) {
		this.mainSnak = snak;
		return this;
	};

	rw.wikibase.Statement.prototype.setPropertyId = function( propertyId ) {
		this.mainSnak.setPropertyId( propertyId );
		return this;
	};

	rw.wikibase.Statement.prototype.setType = function( type ) {
		this.mainSnak.setType( type );
		return this;
	};

	rw.wikibase.Statement.prototype.setValue = function( value ) {
		this.mainSnak.setValue( value );
		return this;
	};

	rw.wikibase.Statement.prototype.addQualifier = function( snak ) {
		this.qualifiers.push( snak );
		return this;
	};

	rw.wikibase.Statement.prototype.getQualifier = function( index ) {
		return this.qualifiers[ index ];
	};

	rw.wikibase.Statement.prototype.getQualifiers = function() {
		return this.qualifiers;
	};

	rw.wikibase.Statement.prototype.removeQualifier = function( index ) {
		this.qualifiers.splice( index, 1 );
		return this;
	};

	rw.wikibase.Statement.prototype.addReference = function( reference ) {
		this.references.push( reference );
		return this;
	};

	rw.wikibase.Statement.prototype.getReference = function( index ) {
		return this.references[ index ];
	};

	rw.wikibase.Statement.prototype.getReferences = function() {
		return this.references;
	};

	rw.wikibase.Statement.prototype.removeReference = function( index ) {
		if ( typeof index === 'string' ) {
			var hash = index;
			index = -1;

			for ( var i=0; i < this.references.length; i++ ) {
				if ( this.references[ i ].getHash() === hash ) {
					index = i;
					break;
				}
			}
		}

		if ( index >= 0 ) {
			this.references.splice( index, 1 );
		}

		return this;
	};

	rw.wikibase.Statement.prototype.removeReferences = function() {
		this.references = [];

		return this;
	};

	rw.wikibase.Statement.prototype.getRank = function() {
		return this.rank;
	};

	rw.wikibase.Statement.prototype.setRank = function( rank ) {
		this.rank = rank;
		return this;
	};

	rw.wikibase.Statement.prototype._build = function() {
		var mainSnak = this.mainSnak._build();

		var snakList = new wb.datamodel.SnakList();
		for ( var i=0; i < this.qualifiers.length; i++ ) {
		    snakList.addItem( this.qualifiers[ i ]._build() );
		}

		var claim = new wb.datamodel.Claim( mainSnak, snakList, this.GUID );

		var referenceList = new wb.datamodel.ReferenceList();
		for ( var i=0; i < this.references.length; i++ ) {
		    referenceList.addItem( references[ i ]._build() );
		}

		return new wb.datamodel.Statement( claim, referenceList, this.rank );
	};

	rw.wikibase.Statement.deserialize = function( data ) {
		if ( data.type !== 'statement' ) {
			return null;
		}

		var statement = new rw.wikibase.Statement( data.mainsnak.property, data.id );
		statement.setRank( [ 'deprecated', 'normal', 'preferred' ].indexOf( data.rank ) );
		statement.setMainSnak( rw.wikibase.Snak.deserialize( data.mainsnak ) );

		for ( propertyId in data.qualifiers ) {
			for ( var i=0; i < data.qualifiers[ propertyId ].length; i++ ) {
				var qualifier = rw.wikibase.Snak.deserialize( data.qualifiers[ propertyId ][ i ] );
				statement.addQualifier( qualifier );
			}
		}

		if ( data.references !== undefined ) {
			for ( var i=0; i < data.references.length; i++ ) {
				var reference = rw.wikibase.Reference.deserialize( data.references[ i ] );
				statement.addReference( reference );
			}
		}

		return statement;
	};

}( mediaWiki, jQuery, mediaWiki.recordWizard, wikibase ) );

