import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

export function NotFoundPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const Root = embedded ? 'div' : 'main';

  return (
    <Root
      className={`flex items-center justify-center px-5 py-12 ${embedded ? 'min-h-[calc(100vh-200px)]' : 'min-h-screen bg-surface'}`}
    >
      <div className="flex w-full max-w-[640px] flex-col items-center text-center">
        <div className="flex h-[168px] w-[168px] items-center justify-center rounded-full bg-[#EEF2FF]">
          <div className="flex h-[124px] w-[124px] items-center justify-center rounded-full bg-[#E0E7FF]">
            <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] shadow-btn">
              <Compass className="h-9 w-9 text-white" aria-hidden="true" />
            </div>
          </div>
        </div>

        <Badge tone="indigo" className="mt-8">
          Error 404 · Not found
        </Badge>

        <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
          We can’t find that page
        </h1>
        <p className="mt-3 max-w-[580px] text-base leading-relaxed text-ink-secondary">
          The link may be broken or the page may have moved.
        </p>

        <Button size="lg" className="mt-8" onClick={() => navigate('/', { replace: true })}>
          Go home
        </Button>
      </div>
    </Root>
  );
}

export default NotFoundPage;
