import { DynamicGameCanvas } from '@/components/canvas/GameCanvasWrapper';
import { TorqueMiniGame } from '@/components/minigames/TorqueMiniGame';
import { WiringMiniGame } from '@/components/minigames/WiringMiniGame';
import { ClockInModal } from '@/components/ui/ClockInModal';
import { ExtraBoltDialog } from '@/components/ui/ExtraBoltDialog';
import { GameHUD } from '@/components/ui/GameHUD';
import { RepairOrderModal } from '@/components/ui/RepairOrderModal';
import { TutorialWalkthrough } from '@/components/ui/TutorialWalkthrough';

export default function HomePage() {
  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-stone-900">
      <DynamicGameCanvas />
      <GameHUD />
      <TutorialWalkthrough />
      <TorqueMiniGame />
      <WiringMiniGame />
      <ClockInModal />
      <ExtraBoltDialog />
      <RepairOrderModal />
    </main>
  );
}
