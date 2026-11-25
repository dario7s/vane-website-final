'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { osFromNavigator, type VisitorOs } from './visitor-os'

const VisitorOsContext = createContext<VisitorOs>('other')

type NavigatorWithHints = Navigator & { userAgentData?: { platform?: string } }

/** Gives the system of the visitor to the download entries. The server value makes the first paint. */
export function VisitorOsProvider({ initialOs, children }: { initialOs: VisitorOs; children: ReactNode }) {
  const [os, setOs] = useState<VisitorOs>(initialOs)

  useEffect(() => {
    const nav = navigator as NavigatorWithHints
    const detected = osFromNavigator({
      userAgent: nav.userAgent,
      platformHint: nav.userAgentData?.platform,
      maxTouchPoints: nav.maxTouchPoints,
    })
    // A cached page or an iPad that tells it is a Mac can make the server value wrong.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detected !== initialOs) setOs(detected)
  }, [initialOs])

  return <VisitorOsContext.Provider value={os}>{children}</VisitorOsContext.Provider>
}

export function useVisitorOs(): VisitorOs {
  return useContext(VisitorOsContext)
}
