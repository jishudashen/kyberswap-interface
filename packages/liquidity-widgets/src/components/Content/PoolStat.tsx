import { useEffect, useState } from 'react';

import { cn } from '@kyber/utils/tailwind-helpers';

import { PATHS } from '@/constants';
import { Univ2PoolType } from '@/schema';
import { PoolType } from '@/schema';
import { useWidgetContext } from '@/stores';
import { formatDisplayNumber } from '@/utils/number';

interface PoolInfo {
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr24h: number;
}

export default function PoolStat({
  chainId,
  poolAddress,
  poolType,
  positionId,
}: {
  chainId: number;
  poolAddress: string;
  poolType: PoolType;
  positionId?: string;
}) {
  const { position } = useWidgetContext(s => s);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);

  const isUniv2 = position !== 'loading' && Univ2PoolType.safeParse(position.poolType).success;

  const poolShare =
    position === 'loading' || !isUniv2 || !('totalSupply' in position)
      ? null
      : Number((BigInt(position.liquidity) * 10000n) / BigInt(position.totalSupply)) / 100;

  useEffect(() => {
    const handleFetchPoolInfo = () => {
      fetch(`${PATHS.ZAP_EARN_API}/v1/pools?chainId=${chainId}&address=${poolAddress}&protocol=${poolType}`)
        .then(res => res.json())
        .then(data => data?.data?.poolStats && setPoolInfo(data.data.poolStats))
        .catch(e => {
          console.log(e.message);
        });
    };

    handleFetchPoolInfo();
  }, [chainId, poolAddress, poolType]);

  return (
    <div
      className={cn(
        'px-4 py-3 border border-stroke rounded-md text-subText text-sm flex flex-col gap-[6px]',
        positionId ? 'mb-4' : 'mb-[10px]',
      )}
    >
      <div className="flex justify-between">
        <span>TVL</span>
        <span className="text-text">
          {poolInfo?.tvl || poolInfo?.tvl === 0
            ? formatDisplayNumber(poolInfo.tvl, {
                style: 'currency',
                significantDigits: 6,
              })
            : '--'}
        </span>
      </div>
      <div className="flex justify-between">
        <span>24h Volume</span>
        <span className="text-text">
          {poolInfo?.volume24h || poolInfo?.volume24h === 0
            ? formatDisplayNumber(poolInfo.volume24h, {
                style: 'currency',
                significantDigits: 6,
              })
            : '--'}
        </span>
      </div>
      <div className="flex justify-between">
        <span>24h Fees</span>
        <span className="text-text">
          {poolInfo?.fees24h || poolInfo?.fees24h === 0
            ? formatDisplayNumber(poolInfo.fees24h, {
                style: 'currency',
                significantDigits: 6,
              })
            : '--'}
        </span>
      </div>
      <div className="flex justify-between">
        <span>Est. APR</span>
        <span className={poolInfo?.apr24h && poolInfo.apr24h > 0 ? 'text-accent' : 'text-text'}>
          {poolInfo?.apr24h || poolInfo?.apr24h === 0
            ? formatDisplayNumber(poolInfo.apr24h, {
                significantDigits: poolInfo.apr24h < 1 ? 2 : poolInfo.apr24h < 10 ? 3 : poolInfo.apr24h < 100 ? 4 : 5,
              }) + '%'
            : '--'}
        </span>
      </div>
      {isUniv2 && (
        <div className="flex justify-between">
          <span>Pool Share</span>
          <span className="text-text">
            {poolShare || poolShare === 0 ? (poolShare < 0.01 ? '<0.01%' : poolShare + '%') : '--'}
          </span>
        </div>
      )}
    </div>
  );
}
