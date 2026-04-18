// types.ts content includes types from both PRs

export interface CoachProfile {
    region?: string;
    introduction?: string;
    isLessonAvailable?: boolean;
}

export interface LessonInquiry {
    // properties from PR #94
}

export interface CoachFinderResult {
    // properties from PR #94
}

export interface CoachMaterialType {
    // properties from PR #93
}

export interface CoachMaterial {
    // properties from PR #93
}

// Ensure no duplicate/conflicting definitions are present