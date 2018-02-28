( function ( mw, $, rw, OO ) {

	/**
	 * Represents the UI for the wizard's Details step.
	 *
	 * @class rw.ui.Details
	 * @extends rw.ui.Step
	 * @constructor
	 */
	rw.ui.Details = function() {
		var ui = this;

		rw.ui.Step.call(
			this,
			'details'
		);

		this.addPreviousButton();
		this.addNextButton();
	};

	OO.inheritClass( rw.ui.Details, rw.ui.Step );

	rw.ui.Details.prototype.load = function ( metadatas, records ) {
	    var ui = this;

		rw.ui.Step.prototype.load.call( this, metadatas, records );

		this.substeps = {
		    locutor: new rw.ui.DetailsLocutor( metadatas ),
		    param: new rw.ui.DetailsParam( metadatas ),
		    generator: new rw.ui.DetailsGenerator( metadatas ),
		};

		this.accordion = new rw.layout.AccordionLayout( {
		    items: [
		        this.substeps.locutor,
		        this.substeps.param,
		        this.substeps.generator
		    ],
		} );

		this.$container.prepend( this.accordion.$element );
	};

	rw.ui.Details.prototype.collect = function() {
	    for ( substep in this.substeps ) {
	        $.extend( this.metadatas, this.substeps[ substep ].collect() );
	    }
	};

}( mediaWiki, jQuery, mediaWiki.recordWizard, OO ) );

