import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // localStorage may be undefined in Node 26+ without --localstorage-file
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
})
