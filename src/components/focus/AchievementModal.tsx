'use client'

import React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { LottieAnimation, ACHIEVEMENT_LAYER_MAP } from '@/components/ui/LottieAnimation'
import { getAchievementInfo } from '@/utils/streaks/achievementUtils'
import { MedalIcon, TrophyIcon, FireIcon, StarIcon, CoinIcon } from '@/components/ui/AnimatedIcons'

const ACHIEVEMENT_ICON_MAP: Record<string, React.FC<{ size?: number }>> = {
  medal: MedalIcon,
  trophy: TrophyIcon,
  fire: FireIcon,
  star: StarIcon,
  coin: CoinIcon,
}

interface AchievementModalProps {
  achievementType: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const AchievementModal: React.FC<AchievementModalProps> = ({
  achievementType,
  open,
  onOpenChange,
}) => {
  const info = achievementType ? getAchievementInfo(achievementType) : null

  if (!info) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px] bg-card border-border rounded-2xl text-center p-6">
        <div className="flex flex-col items-center gap-4">
          <LottieAnimation
            path="/animations/achievement-unlock.json"
            layerColorMap={ACHIEVEMENT_LAYER_MAP}
            width={120}
            height={120}
            loop={false}
            autoplay={true}
          />
          {(() => {
            const IconComp = ACHIEVEMENT_ICON_MAP[info.icon]
            return IconComp ? <IconComp size={48} /> : null
          })()}
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              {info.label}
            </h3>
            <p className="text-sm text-muted-foreground">{info.message}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AchievementModal
