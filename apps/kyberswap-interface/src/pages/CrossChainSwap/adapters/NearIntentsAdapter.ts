import { OneClickService, OpenAPI, QuoteRequest } from '@defuse-protocol/one-click-sdk-typescript'
import { ChainId, Currency } from '@kyberswap/ks-sdk-core'
import { useWalletSelector } from '@near-wallet-selector/react-hook'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import { WalletAdapterProps } from '@solana/wallet-adapter-base'
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { WalletClient, formatUnits } from 'viem'

import { BTC_DEFAULT_RECEIVER, CROSS_CHAIN_FEE_RECEIVER, SOLANA_NATIVE, ZERO_ADDRESS } from 'constants/index'
import { SolanaToken } from 'state/crossChainSwap'

import { Quote } from '../registry'
import {
  BaseSwapAdapter,
  Chain,
  NearQuoteParams,
  NonEvmChain,
  NormalizedQuote,
  NormalizedTxResponse,
  SwapStatus,
} from './BaseSwapAdapter'

export const MappingChainIdToBlockChain: Record<string, string> = {
  [NonEvmChain.Bitcoin]: 'btc',
  [NonEvmChain.Solana]: 'sol',
  [ChainId.MAINNET]: 'eth',
  [ChainId.ARBITRUM]: 'arb',
  [ChainId.BSCMAINNET]: 'bsc',
  [ChainId.BERA]: 'bera',
  [ChainId.MATIC]: 'pol',
  [ChainId.BASE]: 'base',
}

const erc20Abi = [
  {
    inputs: [
      { type: 'address', name: 'recipient' },
      { type: 'uint256', name: 'amount' },
    ],
    name: 'transfer',
    outputs: [{ type: 'bool', name: '' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

export class NearIntentsAdapter extends BaseSwapAdapter {
  constructor() {
    super()
    // Initialize the API client
    OpenAPI.BASE = 'https://1click.chaindefuser.com'
    OpenAPI.TOKEN =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjUtMDQtMjMtdjEifQ.eyJ2IjoxLCJrZXlfdHlwZSI6ImRpc3RyaWJ1dGlvbl9jaGFubmVsIiwicGFydG5lcl9pZCI6Imt5YmVyIiwiaWF0IjoxNzQ5MDQyNDk1LCJleHAiOjE3ODA1Nzg0OTV9.sC5g1Jn4BRIGXkIRmN4dnK2BzbIglLOVuOmnrTItGaAP-QU69lbyYs2QGPE-5c7dRC9Cc3s0ktO50W9VXiqQEefu-VCQTKtjsfIwfAm7wDC1XKUT7lbQL2uODqXxR6yg5d8ENu6p8F2t86_T8IEpid6b1yBidKladbs9tI2QebSp3Sn6bjtsnpD-9W2dsW0Gd6PUkpZizb--YqkmdPQ8Eu85fIxtDO64qbp0Xp6NY8caFEA1yakbwaMEUWXnNX6PB_elfH28sF0cMbqlyAGiHe98J8tZ47kga6e6yZP4UHoak3Y_eRNuX_CpwoXfULx1t8YLoSJEQuP9JsPIoyw5dA'
  }

  getName(): string {
    return 'Near Intents'
  }
  getIcon(): string {
    return 'https://storage.googleapis.com/ks-setting-1d682dca/000c677f-2ebc-44cc-8d76-e4c6d07627631744962669170.png'
  }
  getSupportedChains(): Chain[] {
    return [
      NonEvmChain.Solana,
      NonEvmChain.Bitcoin,
      NonEvmChain.Near,
      ...Object.keys(MappingChainIdToBlockChain).map(Number),
    ]
  }

  getSupportedTokens(_sourceChain: Chain, _destChain: Chain): Currency[] {
    return []
  }

  async getQuote(params: NearQuoteParams): Promise<NormalizedQuote> {
    const deadline = new Date()

    // 1 hour for Bitcoin, 20 minutes for other chains
    deadline.setSeconds(deadline.getSeconds() + (params.fromChain === NonEvmChain.Bitcoin ? 60 * 60 : 60 * 20))

    const fromAssetId =
      'assetId' in params.fromToken
        ? params.fromToken.assetId === 'near'
          ? 'nep141:wrap.near'
          : params.fromToken.assetId
        : params.nearTokens.find(token => {
            const blockchain = MappingChainIdToBlockChain[params.fromChain as ChainId]

            if (params.fromChain === 'solana')
              return (params.fromToken as SolanaToken).id === SOLANA_NATIVE
                ? token.symbol === 'SOL' && token.blockchain === 'sol'
                : token.blockchain === blockchain && token.contractAddress === (params.fromToken as any).id

            return (
              token.blockchain === blockchain &&
              ((params.fromToken as any).isNative
                ? token.symbol.toLowerCase() === params.fromToken.symbol?.toLowerCase() &&
                  token.assetId.includes('omft')
                : token.contractAddress?.toLowerCase() === (params.fromToken as any).wrapped?.address.toLowerCase())
            )
          })?.assetId

    const toAssetId =
      'assetId' in params.toToken
        ? params.toToken.assetId === 'near'
          ? 'nep141:wrap.near'
          : params.toToken.assetId
        : params.nearTokens.find(token => {
            const blockchain = MappingChainIdToBlockChain[params.toChain as ChainId]
            if (params.toChain === 'solana')
              return (params.toToken as SolanaToken).id === SOLANA_NATIVE
                ? token.symbol === 'SOL' && token.blockchain === 'sol'
                : token.blockchain === blockchain && token.contractAddress === (params.toToken as any).id

            return (
              token.blockchain === blockchain &&
              ((params.toToken as any).isNative
                ? token.symbol.toLowerCase() === params.toToken.symbol?.toLowerCase() && token.assetId.includes('omft')
                : token.contractAddress?.toLowerCase() === (params.toToken as any).wrapped?.address.toLowerCase())
            )
          })?.assetId

    if (!fromAssetId || !toAssetId) {
      throw new Error('not supported tokens')
    }

    // Create a quote request
    const quoteRequest: QuoteRequest = {
      dry: true,
      deadline: deadline.toISOString(),
      slippageTolerance: params.slippage,
      swapType: QuoteRequest.swapType.EXACT_INPUT,

      originAsset: fromAssetId,
      depositType: QuoteRequest.depositType.ORIGIN_CHAIN,

      destinationAsset: toAssetId,
      amount: params.amount,

      refundTo: params.sender,
      refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
      referral: 'kyberswap',

      recipient: params.recipient,
      recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
      appFees: [
        {
          recipient: CROSS_CHAIN_FEE_RECEIVER.toLowerCase(),
          fee: params.feeBps,
        },
      ],
    }

    const quote = await OneClickService.getQuote(quoteRequest)
    const formattedInputAmount = formatUnits(BigInt(params.amount), params.fromToken.decimals)
    const formattedOutputAmount = formatUnits(BigInt(quote.quote.amountOut), params.toToken.decimals)
    const inputUsd = +quote.quote.amountInUsd
    const outputUsd = +quote.quote.amountOutUsd

    return {
      quoteParams: params,
      outputAmount: BigInt(quote.quote.amountOut),
      formattedOutputAmount,
      inputUsd: +quote.quote.amountInUsd,
      outputUsd: +quote.quote.amountOutUsd,
      priceImpact: !inputUsd || !outputUsd ? NaN : ((inputUsd - outputUsd) * 100) / inputUsd,
      rate: +formattedOutputAmount / +formattedInputAmount,
      gasFeeUsd: 0,
      timeEstimate: quote.quote.timeEstimate || 0,
      // Near intent dont need to approve, we send token to contract directly
      contractAddress: ZERO_ADDRESS,
      rawQuote: quote,
      protocolFee: 0,
      platformFeePercent: (params.feeBps * 100) / 10_000,
    }
  }

  async executeSwap(
    { quote }: Quote,
    walletClient: WalletClient,
    nearWallet?: ReturnType<typeof useWalletSelector>,
    sendBtcFn?: (params: { recipient: string; amount: string | number }) => Promise<string>,
    sendSolanaFn?: WalletAdapterProps['sendTransaction'],
    solanaConnection?: Connection,
  ): Promise<NormalizedTxResponse> {
    const quoteParams = {
      ...quote.rawQuote.quoteRequest,
      dry: false,
      // adjust slippage to 0,01% to accept the rate change
      slippageTolerance:
        Math.floor(quote.quoteParams.slippage * 0.9) > 1
          ? Math.floor(quote.quoteParams.slippage * 0.9)
          : quote.quoteParams.slippage,
    }
    delete quoteParams.correlationId

    const refreshedQuote = await OneClickService.getQuote(quoteParams)
    const depositAddress = refreshedQuote?.quote?.depositAddress

    if (!depositAddress) {
      throw new Error('Deposit address not found')
    }

    if (
      refreshedQuote.quoteRequest.recipient === ZERO_ADDRESS ||
      refreshedQuote.quoteRequest.refundTo === ZERO_ADDRESS ||
      refreshedQuote.quoteRequest.recipient.toLowerCase() === BTC_DEFAULT_RECEIVER ||
      refreshedQuote.quoteRequest.refundTo.toLowerCase() === BTC_DEFAULT_RECEIVER
    ) {
      throw new Error('Near Intent recipient or refundTo is ZERO ADDRESS')
    }
    if (BigInt(refreshedQuote.quote.minAmountOut) < BigInt(quote.rawQuote.quote.minAmountOut)) {
      throw new Error('Quote amount out is less than expected')
    }

    const params = {
      sender: quote.quoteParams.sender,
      id: depositAddress, // specific id for each provider
      adapter: this.getName(),
      sourceChain: quote.quoteParams.fromChain,
      targetChain: quote.quoteParams.toChain,
      inputAmount: quote.quoteParams.amount,
      outputAmount: quote.outputAmount.toString(),
      sourceToken: quote.quoteParams.fromToken,
      targetToken: quote.quoteParams.toToken,
      timestamp: new Date().getTime(),
    }

    if (quote.quoteParams.fromChain === NonEvmChain.Solana) {
      return new Promise<NormalizedTxResponse>(async (resolve, reject) => {
        if (!sendSolanaFn || !solanaConnection) {
          reject('Not connected')
          return
        }
        const waitForConfirmation = async (txId: string) => {
          try {
            const latestBlockhash = await solanaConnection.getLatestBlockhash()

            // Wait for confirmation with timeout
            const confirmation = await Promise.race([
              solanaConnection.confirmTransaction(
                {
                  signature: txId,
                  blockhash: latestBlockhash.blockhash,
                  lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                },
                'confirmed',
              ),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000),
              ),
            ])

            const confirmationResult = confirmation as { value: { err: any } }
            if (confirmationResult.value.err) {
              throw new Error(`Transaction failed: ${JSON.stringify(confirmationResult.value.err)}`)
            }

            console.log('Transaction confirmed successfully!')
          } catch (confirmError) {
            console.error('Transaction confirmation failed:', confirmError)

            // Check if transaction actually succeeded despite timeout
            const txStatus = await solanaConnection.getSignatureStatus(txId)
            if (txStatus?.value?.confirmationStatus !== 'confirmed') {
              throw new Error(`Transaction was not confirmed: ${confirmError.message}`)
            }
          }
        }

        const fromPubkey = new PublicKey(quote.quoteParams.sender)
        const recipientPubkey = new PublicKey(depositAddress)

        const fromToken = quote.quoteParams.fromToken as SolanaToken

        // const latestBlockhash = await solanaConnection.getLatestBlockhash('confirmed')

        if (fromToken.id === SOLANA_NATIVE) {
          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: fromPubkey,
              toPubkey: recipientPubkey,
              lamports: BigInt(quote.quoteParams.amount),
            }),
          )
          try {
            const signature = await sendSolanaFn(transaction, solanaConnection)
            await waitForConfirmation(signature)

            resolve({
              ...params,
              sourceTxHash: signature,
            })
          } catch (error) {
            reject(error)
          }
        } else {
          const mintPubkey = new PublicKey(fromToken.id)
          // Get associated token addresses
          const senderTokenAddress = await getAssociatedTokenAddress(
            mintPubkey,
            fromPubkey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          )
          const recipientTokenAddress = await getAssociatedTokenAddress(
            mintPubkey,
            recipientPubkey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          )
          const transaction = new Transaction()

          try {
            // Check if recipient's token account exists
            await getAccount(solanaConnection, recipientTokenAddress)
          } catch (err) {
            // Account doesn't exist, create it
            console.log('Creating recipient token account...')
            transaction.add(
              createAssociatedTokenAccountInstruction(
                fromPubkey, // payer
                recipientTokenAddress, // associated token account
                recipientPubkey, // owner
                mintPubkey, // mint
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID,
              ),
            )
          }

          // Add transfer instruction
          transaction.add(
            createTransferInstruction(
              senderTokenAddress, // source
              recipientTokenAddress, // destination
              fromPubkey, // owner
              BigInt(quote.quoteParams.amount),
              [],
              TOKEN_PROGRAM_ID,
            ),
          )

          try {
            const signature = await sendSolanaFn(transaction, solanaConnection)
            await waitForConfirmation(signature)

            resolve({
              ...params,
              sourceTxHash: signature,
            })
          } catch (error) {
            reject(error)
          }
        }
        return
      })
    }

    if (quote.quoteParams.fromChain === NonEvmChain.Bitcoin) {
      return new Promise<NormalizedTxResponse>(async (resolve, reject) => {
        if (!sendBtcFn) {
          reject('Not connected')
          return
        }

        try {
          const tx = await sendBtcFn({
            recipient: depositAddress,
            amount: quote.quoteParams.amount,
          })
          await OneClickService.submitDepositTx({
            txHash: tx,
            depositAddress,
          }).catch(e => {
            console.log('NearIntents submitDepositTx failed', e)
          })
          resolve({
            ...params,
            sourceTxHash: tx,
          })
        } catch (e) {
          console.log(e)
          reject(e)
          return
        }
      })
    }

    if (quote.quoteParams.fromChain === NonEvmChain.Near) {
      return new Promise<NormalizedTxResponse>(async (resolve, reject) => {
        if (!nearWallet || !nearWallet.signedAccountId) {
          reject('Not connected')
          return
        }
        const isNative = (quote.quoteParams.fromToken as any).assetId === 'near'

        const transactions: any = []
        if (!isNative)
          transactions.push({
            signerId: nearWallet.signedAccountId,
            receiverId: (quote.quoteParams.fromToken as any).contractAddress,
            actions: [
              {
                type: 'FunctionCall',
                params: {
                  methodName: 'storage_deposit',
                  args: { account_id: depositAddress, registration_only: true },
                  gas: '30000000000000',
                  deposit: '1250000000000000000000', // 0.00125 NEAR
                },
              },
            ],
          })

        transactions.push({
          signerId: nearWallet.signedAccountId,
          receiverId: isNative ? depositAddress : (quote.quoteParams.fromToken as any).contractAddress,
          actions: [
            isNative
              ? {
                  type: 'Transfer',
                  params: {
                    deposit: quote.quoteParams.amount,
                  },
                }
              : {
                  type: 'FunctionCall',
                  params: {
                    methodName: 'ft_transfer',
                    args: {
                      receiver_id: depositAddress,
                      amount: quote.quoteParams.amount,
                    },
                    gas: '30000000000000',
                    deposit: '1',
                  },
                },
          ],
        })

        // My near wallet is redirect to wallet website -> need store to process later
        if (nearWallet?.wallet?.id === 'my-near-wallet')
          localStorage.setItem(
            'cross-chain-swap-my-near-wallet-tx',
            JSON.stringify({
              ...params,
              sourceTxHash: depositAddress,
            }),
          )

        await nearWallet
          .signAndSendTransactions({
            transactions,
          })
          .catch(e => {
            console.log('NearIntents signAndSendTransactions failed', e)
            if (nearWallet?.wallet?.id === 'my-near-wallet') reject()
            else reject(e)
          })

        resolve({
          ...params,
          sourceTxHash: depositAddress,
        })
      })
    }

    return new Promise<NormalizedTxResponse>(async (resolve, reject) => {
      try {
        if (!walletClient || !walletClient.account) reject('Not connected')
        if (quote.quoteParams.sender === ZERO_ADDRESS || quote.quoteParams.recipient === ZERO_ADDRESS) {
          reject('Near Intent refundTo or recipient is ZERO ADDRESS')
          return
        }

        const account = walletClient.account?.address as `0x${string}`

        const fromToken = quote.quoteParams.fromToken

        const hash = await ((fromToken as any).isNative
          ? walletClient.sendTransaction({
              to: depositAddress as `0x${string}`,
              value: BigInt(quote.quoteParams.amount),
              chain: undefined,
              account,
            })
          : walletClient.writeContract({
              address: ('contractAddress' in fromToken
                ? fromToken.contractAddress
                : (fromToken as any).wrapped.address) as `0x${string}`,
              abi: erc20Abi,
              functionName: 'transfer',
              args: [depositAddress, quote.quoteParams.amount],
              chain: undefined,
              account,
            }))
        await OneClickService.submitDepositTx({
          txHash: hash,
          depositAddress,
        }).catch(e => {
          console.log('NearIntents submitDepositTx failed', e)
        })

        resolve({
          ...params,
          sourceTxHash: hash,
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  async getTransactionStatus(p: NormalizedTxResponse): Promise<SwapStatus> {
    const res = await OneClickService.getExecutionStatus(p.id)

    return {
      txHash: res.swapDetails?.destinationChainTxHashes[0]?.hash || '',
      status:
        res.status === 'SUCCESS'
          ? 'Success'
          : res.status === 'FAILED'
          ? 'Failed'
          : res.status === 'REFUNDED'
          ? 'Refunded'
          : 'Processing',
    }
  }
}
