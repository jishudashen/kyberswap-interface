import { BitcoinWalletBase, CreateProviderParams, SendBitcoinParams } from '../types'

const isOkxInstalled = () => typeof window !== 'undefined' && 'okxwallet' in window && window.okxwallet !== undefined

export const createOkxProvider = ({
  connectingWallet,
  setConnectingWallet,
  setWalletInfo,
  defaultInfo,
}: CreateProviderParams): BitcoinWalletBase => {
  // Function to handle account changes
  const handleAccountsChanged = async (accounts: string[]) => {
    if (accounts.length === 0) {
      // User disconnected wallet
      setWalletInfo(defaultInfo)
      localStorage.removeItem('bitcoinWallet')
    } else {
      // Account changed - update wallet info
      try {
        const resp = await window.okxwallet.bitcoin.connect()
        if (resp) {
          const { address, compressedPublicKey } = resp
          setWalletInfo({
            isConnected: true,
            address,
            publicKey: compressedPublicKey,
            walletType: 'okx',
          })
        }
      } catch (error) {
        console.log('Error updating wallet info after account change:', error)
      }
    }
  }

  // Set up event listener when wallet is available
  const setupEventListeners = () => {
    if (isOkxInstalled() && window.okxwallet.bitcoin) {
      // Listen for account changes
      window.okxwallet.bitcoin.on?.('accountsChanged', handleAccountsChanged)

      // Listen for disconnect events (if available)
      window.okxwallet.bitcoin.on?.('disconnect', () => {
        setWalletInfo(defaultInfo)
        localStorage.removeItem('bitcoinWallet')
      })
    }
  }

  // Remove event listeners
  const removeEventListeners = () => {
    if (isOkxInstalled() && window.okxwallet.bitcoin) {
      window.okxwallet.bitcoin.removeListener?.('accountsChanged', handleAccountsChanged)
      window.okxwallet.bitcoin.removeListener?.('disconnect', () => {})
    }
  }
  return {
    name: 'OKX Wallet',
    logo: 'https://storage.googleapis.com/ks-setting-1d682dca/77e2b120-4456-4181-b621-f2bbc590689d1747713432378.png',
    type: 'okx' as const,
    isInstalled: () => isOkxInstalled(),
    connect: async () => {
      try {
        if (!isOkxInstalled()) {
          window.open('https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge', '_blank')
          return
        }
        if (!!connectingWallet) {
          return
        }
        setConnectingWallet('okx')
        let resp = await window.okxwallet.bitcoin.connect()
        // sometime okx return null => throw error => user try again => always failed.
        // => call disconnect && connect again will resolve
        if (resp === null) await window.okxwallet.bitcoin.disconnect?.()
        resp = await window.okxwallet.bitcoin.connect()

        const { address, compressedPublicKey } = resp
        setWalletInfo({
          isConnected: true,
          address,
          publicKey: compressedPublicKey,
          walletType: 'okx',
        })
        setConnectingWallet(null)

        setupEventListeners()
      } catch (e) {
        console.log('okx connect error', e)
        setConnectingWallet
      }
    },
    disconnect: async () => {
      removeEventListeners()
      await window.okxwallet.bitcoin.disconnect?.()
      localStorage.removeItem('bitcoinWallet')
      setWalletInfo(defaultInfo)
    },
    sendBitcoin: async ({ recipient, amount, options }: SendBitcoinParams) => {
      return await window.okxwallet.bitcoin.sendBitcoin(recipient, Number(amount), options)
    },
  }
}
