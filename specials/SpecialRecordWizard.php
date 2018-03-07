<?php
/**
 * recordWizard SpecialPage for RecordWizard extension
 *
 * @file
 * @ingroup Extensions
 */
class SpecialRecordWizard extends SpecialPage {
	public function __construct() {
		parent::__construct( 'RecordWizard', 'upload' );
	}

	/**
	 * Show the page to the user
	 *
	 * @param string $sub The subpage string argument (if any).
	 */
	public function execute( $sub ) {
		global $wgRecordWizardConfig, $wgWBRepoSettings;

		$out = $this->getOutput();
		$config = array();
		if ( !( $this->isUploadAllowed() && $this->isUserUploadAllowed( $this->getUser() ) ) ) {
			return;
		}

		$qids = [];
		$dbr = wfGetDB( DB_REPLICA );

		$res = $dbr->select(
			array( 'text', 'revision', 'page' ),
			array( 'page_title' ),
			array(
				'page_content_model' => 'wikibase-item',
				'old_text like \'%"property":"' . $wgRecordWizardConfig['properties']["langCode"] . '"%\'',
			),
			__METHOD__,
			array(),
			array(
				'revision' => array( 'INNER JOIN', array( 'old_id=rev_text_id' ) ),
				'page' => array( 'INNER JOIN', array( 'page_latest=rev_id' ) )
			)
		);

		foreach( $res as $row ) {
			$qids[] = $row->page_title;
		}

		$titles = [];
		foreach( $qids as $qid ) {
			$titles[] = \Title::makeTitle( $wgWBRepoSettings['entityNamespaces']['item'], $qid );
		}

		$wbRepo = Wikibase\Repo\WikibaseRepo::getDefaultInstance();
		$entityIdLookup = $wbRepo->getEntityIdLookup();
		$entityRevisionLookup = $wbRepo->getEntityRevisionLookup();
		$languageFallbackChain = $wbRepo->getLanguageFallbackChainFactory()->newFromLanguage( $wbRepo->getUserLanguage() );

		$entities = $entityIdLookup->getEntityIds( $titles );
		$langCodeProperty = $entityIdLookup->getEntityIdForTitle( \Title::makeTitle( $wgWBRepoSettings['entityNamespaces']['property'], $wgRecordWizardConfig['properties']['langCode'] ) );

		$config[ 'languages' ] = array();
		foreach ( $entities as $id => $itemId ) {
			//TODO: Perfs: do only one DB request instead of N
			$entity = $entityRevisionLookup->getEntityRevision( $itemId )->getEntity();

			$terms = $entity->getLabels();
			$labels = [];
			foreach ( $terms as $term ) {
				$languageCode = $term->getLanguageCode();
				$labels[$languageCode] = $term->getText();
			}

			$label = $languageFallbackChain->extractPreferredValueOrAny( $labels )[ 'value' ];
			$langCode = $entity->getStatements()->getByPropertyId( $langCodeProperty )->getAllSnaks()[ 0 ]->getDataValue()->getValue();

			$config[ 'languages' ][ $langCode ] = array();
			$config[ 'languages' ][ $langCode ][ 'code' ] = $langCode;
			$config[ 'languages' ][ $langCode ][ 'qid' ] = (string) $itemId;
			$config[ 'languages' ][ $langCode ][ 'localname' ] = $label;
		}
		$config[ 'properties' ] = $wgRecordWizardConfig[ 'properties' ];
		$config[ 'items' ] = $wgRecordWizardConfig[ 'items' ];

		$out->addJsConfigVars( [ 'RecordWizardConfig' => $config ] );
		$out->addModuleStyles( 'ext.recordWizard.styles' );
		$out->addModules( 'ext.recordWizard' );
		$out->setPageTitle( $this->msg( 'special-recordWizard-title' ) );
		$out->addHelpLink( 'Yolo' );
		$out->addWikiMsg( 'special-recordWizard-intro' );
		$out->addHTML( $this->getWizardHtml() );
	}

	protected function getGroupName() {
		return 'media';
	}

	/**
	 * Check if anyone can upload (or if other sitewide config prevents this)
	 * Side effect: will print error page to wgOut if cannot upload.
	 * @return boolean -- true if can upload
	 */
	private function isUploadAllowed() {
		// Check uploading enabled
		if ( !UploadBase::isEnabled() ) {
			$this->getOutput()->showErrorPage( 'uploaddisabled', 'uploaddisabledtext' );
			return false;
		}
		// XXX does wgEnableAPI affect all uploads too?
		// Check whether we actually want to allow changing stuff
		if ( wfReadOnly() ) {
			$this->getOutput()->readOnlyPage();
			return false;
		}
		// we got all the way here, so it must be okay to upload
		return true;
	}

	/**
	 * Check if the user can upload
	 * Side effect: will print error page to wgOut if cannot upload.
	 * @param User $user
	 * @throws PermissionsError
	 * @throws UserBlockedError
	 * @return boolean -- true if can upload
	 */
	private function isUserUploadAllowed( User $user ) {
		// Check permissions
		$permissionRequired = UploadBase::isAllowed( $user );
		if ( $permissionRequired !== true ) {
			throw new PermissionsError( $permissionRequired );
		}
		// Check blocks
		if ( $user->isBlocked() ) {
			throw new UserBlockedError( $user->getBlock() );
		}
		// Global blocks
		if ( $user->isBlockedGlobally() ) {
			throw new UserBlockedError( $user->getGlobalBlock() );
		}

		// we got all the way here, so it must be okay to upload
		return true;
	}

	protected function getWizardHtml() {
		global $wgExtensionAssetsPath;

		return '<div id="mwe-recwiz">

		            <ul class="mwe-recwiz-steps">
                    </ul>

                    <div id="mwe-recwiz-content">
                    </div>

		        </div>';
	}
}
