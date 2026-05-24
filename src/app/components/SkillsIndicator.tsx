"use client";

import React from "react";
import { CloudLightning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Skill {
  name: string;
  description?: string;
}

interface SkillsIndicatorProps {
  skills: Skill[];
  className?: string;
}

export const SkillsIndicator = React.memo<SkillsIndicatorProps>(
  ({ skills, className }) => {
    if (!skills || skills.length === 0) return null;

    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
                className
              )}
            >
              <CloudLightning className="h-3 w-3" />
              <span>{skills.length} skill{skills.length !== 1 ? "s" : ""}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-h-64 max-w-xs overflow-y-auto p-2"
          >
            <div className="space-y-1.5">
              {skills.map((skill, i) => (
                <div key={i} className="rounded-sm px-2 py-1">
                  <div className="text-sm font-medium">{skill.name}</div>
                  {skill.description && (
                    <div className="text-xs text-muted-foreground">
                      {skill.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);

SkillsIndicator.displayName = "SkillsIndicator";
