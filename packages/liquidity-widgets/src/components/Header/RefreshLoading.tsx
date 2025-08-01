import { useEffect, useState } from 'react';

import { useTokenPrices } from '@kyber/hooks/use-token-prices';

import useDebounce from '@/hooks/useDebounce';
import { useWidgetContext } from '@/stores';

const INTERVAL_REFETCH_TIME = 10; // seconds
let interval: ReturnType<typeof setInterval>;

const Spin = ({ countdown }: { countdown: number }) => {
  const theme = useWidgetContext(s => s.theme);

  return (
    <svg
      data-spinning={!countdown}
      id="arrow_loading"
      xmlns="http://www.w3.org/2000/svg"
      color={theme.accent}
      viewBox="2 2 20 20"
      width="24"
      height="24"
      className="data-[spinning='true']:animate-spin duration-700 ease-linear repeat-infinite"
    >
      <path
        stroke="none"
        fill={theme.accent + '66'}
        d="M16.2751 7.78995C13.932 5.44681 10.133 5.44681 7.78986 7.78995C7.02853 8.55128 6.51457 9.4663 6.24798 10.4351C6.24473 10.4499 6.24114 10.4646 6.23719 10.4793C6.17635 10.7064 6.12938 10.9339 6.09577 11.161C5.83159 12.9457 6.39255 14.7026 7.52624 15.9944C7.61054 16.0901 7.69842 16.1838 7.78986 16.2752C8.08307 16.5685 8.39909 16.825 8.7322 17.0448C9.25533 17.3892 9.84172 17.6568 10.4798 17.8278C10.7386 17.8971 10.9979 17.9484 11.2565 17.9825C12.9537 18.2061 14.6187 17.6866 15.8747 16.6415C16.0123 16.5265 16.1459 16.4044 16.2751 16.2752C16.2848 16.2655 16.2947 16.2561 16.3047 16.2469C17.0123 15.531 17.5491 14.627 17.8283 13.5851C17.9712 13.0517 18.5196 12.7351 19.053 12.878C19.5865 13.021 19.9031 13.5693 19.7602 14.1028C19.3141 15.7676 18.3745 17.1684 17.1409 18.1899C16.1883 18.9822 15.0949 19.5189 13.9515 19.8002C11.8607 20.3147 9.6028 19.9749 7.7328 18.7809C7.06855 18.3579 6.47841 17.8432 5.97519 17.2589C5.12341 16.2738 4.55173 15.1302 4.26015 13.9324C4.01698 12.9416 3.96104 11.8931 4.12168 10.8379C4.36697 9.20484 5.1183 7.63309 6.37564 6.37574C9.49984 3.25154 14.5652 3.25154 17.6894 6.37574L18.2332 6.91959L18.2337 5.49951C18.2338 5.05769 18.5921 4.69964 19.034 4.69979C19.4758 4.69995 19.8338 5.05825 19.8337 5.50007L19.8325 9.03277L19.8322 9.8325L19.0325 9.83249L18.9401 9.83249C18.8146 9.85665 18.6854 9.85665 18.5599 9.83248L15.5005 9.83245C15.0587 9.83245 14.7005 9.47427 14.7005 9.03244C14.7005 8.59062 15.0587 8.23245 15.5005 8.23245L16.7176 8.23246L16.2751 7.78995Z"
      />
      <defs>
        <path
          id="arrow"
          stroke="none"
          fill="none"
          d="M16.2751 7.78995C13.932 5.44681 10.133 5.44681 7.78986 7.78995C7.02853 8.55128 6.51457 9.4663 6.24798 10.4351C6.24473 10.4499 6.24114 10.4646 6.23719 10.4793C6.17635 10.7064 6.12938 10.9339 6.09577 11.161C5.83159 12.9457 6.39255 14.7026 7.52624 15.9944C7.61054 16.0901 7.69842 16.1838 7.78986 16.2752C8.08307 16.5685 8.39909 16.825 8.7322 17.0448C9.25533 17.3892 9.84172 17.6568 10.4798 17.8278C10.7386 17.8971 10.9979 17.9484 11.2565 17.9825C12.9537 18.2061 14.6187 17.6866 15.8747 16.6415C16.0123 16.5265 16.1459 16.4044 16.2751 16.2752C16.2848 16.2655 16.2947 16.2561 16.3047 16.2469C17.0123 15.531 17.5491 14.627 17.8283 13.5851C17.9712 13.0517 18.5196 12.7351 19.053 12.878C19.5865 13.021 19.9031 13.5693 19.7602 14.1028C19.3141 15.7676 18.3745 17.1684 17.1409 18.1899C16.1883 18.9822 15.0949 19.5189 13.9515 19.8002C11.8607 20.3147 9.6028 19.9749 7.7328 18.7809C7.06855 18.3579 6.47841 17.8432 5.97519 17.2589C5.12341 16.2738 4.55173 15.1302 4.26015 13.9324C4.01698 12.9416 3.96104 11.8931 4.12168 10.8379C4.36697 9.20484 5.1183 7.63309 6.37564 6.37574C9.49984 3.25154 14.5652 3.25154 17.6894 6.37574L18.2332 6.91959L18.2337 5.49951C18.2338 5.05769 18.5921 4.69964 19.034 4.69979C19.4758 4.69995 19.8338 5.05825 19.8337 5.50007L19.8325 9.03277L19.8322 9.8325L19.0325 9.83249L18.9401 9.83249C18.8146 9.85665 18.6854 9.85665 18.5599 9.83248L15.5005 9.83245C15.0587 9.83245 14.7005 9.47427 14.7005 9.03244C14.7005 8.59062 15.0587 8.23245 15.5005 8.23245L16.7176 8.23246L16.2751 7.78995Z"
        />
        <clipPath id="arrow-clip">
          <use xlinkHref="#arrow" />
        </clipPath>
      </defs>
      <g clipPath="url(#arrow-clip)">
        <circle
          cx="12"
          cy="12"
          r="5"
          transform="rotate(365,12,12)"
          fill="none"
          stroke="currentColor"
          strokeWidth="16"
          strokeDasharray="30"
          strokeDashoffset={!countdown ? 0 : -30 + (countdown / (INTERVAL_REFETCH_TIME * 1_000)) * 30}
        />
      </g>
    </svg>
  );
};

export default function RefreshLoading() {
  const { chainId, poolLoading, getPool } = useWidgetContext(s => s);

  const { fetchPrices } = useTokenPrices({
    addresses: [],
    chainId,
  });
  const [countdown, setCountdown] = useState(0);

  const debouncedRefetchLoading = useDebounce(poolLoading, 100);

  useEffect(() => {
    if (!poolLoading && !debouncedRefetchLoading) setCountdown(INTERVAL_REFETCH_TIME * 1_000);
    else if (poolLoading && debouncedRefetchLoading) setCountdown(0);
  }, [poolLoading, debouncedRefetchLoading]);

  useEffect(() => {
    if (countdown > 0) {
      interval = setInterval(() => {
        const newCountdown = countdown - 10;
        setCountdown(newCountdown);
        if (newCountdown === 10) {
          getPool(fetchPrices);
        }
      }, 10);
    }

    return () => {
      clearInterval(interval);
    };
  }, [countdown, fetchPrices, getPool]);

  return (
    <div className="flex items-center relative w-fit">
      <Spin countdown={countdown} />

      {countdown > 0 && (
        <div className="text-xs font-medium absolute ml-auto mr-auto left-0 right-0 text-center text-accent">
          {(countdown / 1_000).toFixed()}
        </div>
      )}
    </div>
  );
}
