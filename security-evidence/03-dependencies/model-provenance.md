# Model Provenance Review — Phase 3

**Test ID:** P3-DEP-03  
**Environment:** local read-only repository inspection.  
**Result:** Fail — provenance and checksums absent from the reviewed repository.

Ten model-weight artifacts (`.pt`) were found, including YOLO and RoadDetectionModel weights in `backend/` and duplicated documentation/archive directories. Training result images/CSV and notebooks are present, but no checksum manifest, signed release record, model card, source URL/license record for each weight, dataset lineage record, or immutable version/provenance register was found.

This is F-P3-003 (Medium). Recommended mitigation: maintain a versioned manifest with model filename, SHA-256 checksum, source/training commit, dataset version/license, training parameters, reviewer, and approval date; verify the checksum before deployment.

