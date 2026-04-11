"use client";
import { useMemo } from "react";
import { Check, Lock } from "lucide-react";

export type StageState = "untouched" | "in-progress" | "completed" | "locked";

interface StageTrackerProps {
    currentStage: string;
    onNavigate?: (stage: string) => void;
    completedStages?: string[];
    stageStates?: Record<string, StageState>;
    canSkipTo?: (stage: string) => boolean;
}

// New 5-stage workflow: brainstorm → research → production → review → publish
const STAGES = [
    { id: "brainstorm", label: "Brainstorm", icon: "💡" },
    { id: "research", label: "Research", icon: "🔍" },
    { id: "production", label: "Production", icon: "✏️" },
    { id: "review", label: "Review", icon: "📋" },
    { id: "publish", label: "Publish", icon: "🚀" },
];

export const STAGE_ORDER = STAGES.map(s => s.id);

/**
 * Default skip rules:
 * - brainstorm: always accessible
 * - research: accessible if brainstorm done or idea selected from library
 * - production: accessible if has content or can import
 * - review: LOCKED - cannot skip, requires production content
 * - publish: LOCKED - requires production + review completed
 */
export function getDefaultSkipRules(completedStages: string[]): (stage: string) => boolean {
    return (stage: string) => {
        switch (stage) {
            case "brainstorm":
                return true; // Always accessible
            case "research":
                return true; // Can skip if selecting from library
            case "production":
                return true; // Can import content
            case "review":
                // Locked - requires production to be completed
                return completedStages.includes("production");
            case "publish":
                // Locked - requires both production and review
                return completedStages.includes("production") && completedStages.includes("review");
            default:
                return false;
        }
    };
}

export default function StageTracker({
    currentStage,
    onNavigate,
    completedStages = [],
    stageStates,
    canSkipTo,
}: StageTrackerProps) {
    const currentIndex = useMemo(() =>
        STAGES.findIndex(s => s.id === currentStage),
        [currentStage]
    );

    // Use provided skip rules or default
    const checkCanSkip = canSkipTo || getDefaultSkipRules(completedStages);

    // Determine state for each stage
    const getStageState = (stage: typeof STAGES[0], index: number): StageState => {
        if (stageStates?.[stage.id]) {
            return stageStates[stage.id];
        }

        if (completedStages.includes(stage.id)) {
            return "completed";
        }

        if (stage.id === currentStage) {
            return "in-progress";
        }

        // Check if locked (review and publish have special rules)
        if (stage.id === "review" && !completedStages.includes("production")) {
            return "locked";
        }
        if (stage.id === "publish" && (!completedStages.includes("production") || !completedStages.includes("review"))) {
            return "locked";
        }

        return "untouched";
    };

    return (
        <div className="flex items-center w-full">
            {STAGES.map((stage, i) => {
                const state = getStageState(stage, i);
                const isCompleted = state === "completed";
                const isCurrent = stage.id === currentStage;
                const isLocked = state === "locked";
                const isClickable = !isLocked && (checkCanSkip(stage.id) || isCompleted || isCurrent);

                return (
                    <div key={stage.id} className="flex items-center flex-1">
                        <button
                            onClick={() => isClickable && onNavigate?.(stage.id)}
                            disabled={!isClickable}
                            title={isLocked ? getLockedMessage(stage.id) : undefined}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                                ${isCurrent
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : isCompleted
                                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                        : isLocked
                                            ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }
                                ${isClickable ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed"}
                                ${!isClickable && !isLocked ? "opacity-50" : ""}
                            `}
                        >
                            {isLocked ? (
                                <Lock className="h-4 w-4" />
                            ) : isCompleted && !isCurrent ? (
                                <Check className="h-4 w-4" />
                            ) : (
                                <span>{stage.icon}</span>
                            )}
                            <span className="text-sm font-medium">{stage.label}</span>
                        </button>
                        {i < STAGES.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? "bg-green-400" :
                                    i < currentIndex ? "bg-primary/30" :
                                        "bg-muted"
                                }`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function getLockedMessage(stageId: string): string {
    switch (stageId) {
        case "review":
            return "Complete Production stage first";
        case "publish":
            return "Complete Production and Review stages first";
        default:
            return "Stage locked";
    }
}
