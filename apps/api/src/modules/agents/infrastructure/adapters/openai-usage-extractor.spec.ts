import { EMPTY_USAGE } from '../../domain/cost/cost-types'
import { OpenAiUsageExtractor } from './openai-usage-extractor'

describe('OpenAiUsageExtractor', () => {
  const extractor = new OpenAiUsageExtractor()

  describe('extract', () => {
    it('maps full response with all fields correctly', () => {
      const response = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: {
            cached_tokens: 20,
            cache_creation_input_tokens: 5,
            audio_tokens: 0,
          },
          completion_tokens_details: {
            reasoning_tokens: 10,
            audio_tokens: 0,
            accepted_prediction_tokens: 0,
            rejected_prediction_tokens: 0,
          },
        },
      }

      const result = extractor.extract(response)

      expect(result.inputCachedRead).toBe(20)
      expect(result.inputCachedWrite).toBe(5)
      expect(result.inputUncached).toBe(75) // 100 - 20 - 5
      expect(result.outputReasoning).toBe(10)
      expect(result.output).toBe(40) // 50 - 10
    })

    it('handles missing prompt_tokens_details', () => {
      const response = {
        usage: {
          prompt_tokens: 80,
          completion_tokens: 30,
          total_tokens: 110,
        },
      }

      const result = extractor.extract(response)

      expect(result.inputCachedRead).toBe(0)
      expect(result.inputCachedWrite).toBe(0)
      expect(result.inputUncached).toBe(80)
      expect(result.outputReasoning).toBe(0)
      expect(result.output).toBe(30)
    })

    it('clamps inputUncached to 0 when cached_tokens equals prompt_tokens', () => {
      const response = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_tokens_details: {
            cached_tokens: 100,
            audio_tokens: 0,
          },
        },
      }

      const result = extractor.extract(response)

      expect(result.inputCachedRead).toBe(100)
      expect(result.inputUncached).toBe(0)
    })

    it('handles missing completion_tokens_details', () => {
      const response = {
        usage: {
          prompt_tokens: 50,
          completion_tokens: 40,
          total_tokens: 90,
          prompt_tokens_details: {
            cached_tokens: 0,
            audio_tokens: 0,
          },
        },
      }

      const result = extractor.extract(response)

      expect(result.outputReasoning).toBe(0)
      expect(result.output).toBe(40)
    })

    it('returns EMPTY_USAGE for completely invalid (non-object) response', () => {
      expect(extractor.extract(null)).toEqual(EMPTY_USAGE)
      expect(extractor.extract(undefined)).toEqual(EMPTY_USAGE)
      expect(extractor.extract('invalid')).toEqual(EMPTY_USAGE)
      expect(extractor.extract(42)).toEqual(EMPTY_USAGE)
    })
  })

  describe('detectDroppedFields', () => {
    it('returns [] when extractor correctly captures cached_tokens: 50', () => {
      const response = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 30,
          prompt_tokens_details: { cached_tokens: 50 },
        },
      }
      const extracted = extractor.extract(response)

      expect(extractor.detectDroppedFields(response, extracted)).toEqual([])
    })

    it('returns [inputCachedRead] when cached_tokens: 50 but extracted inputCachedRead=0', () => {
      const response = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 30,
          prompt_tokens_details: { cached_tokens: 50 },
        },
      }
      // Simulate a dropped extraction
      const fakeExtracted = { ...extractor.extract(response), inputCachedRead: 0 }

      expect(extractor.detectDroppedFields(response, fakeExtracted)).toEqual(['inputCachedRead'])
    })

    it('returns [] when cached_tokens is 0 (not a drop per R-05.6c — vendor reported zero)', () => {
      const response = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 30,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      }
      const fakeExtracted = { ...extractor.extract(response), inputCachedRead: 0 }

      expect(extractor.detectDroppedFields(response, fakeExtracted)).toEqual([])
    })

    it('returns [inputCachedWrite] when cache_creation_input_tokens present but extractor zeroed it', () => {
      const response = {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 30,
          prompt_tokens_details: { cached_tokens: 0, cache_creation_input_tokens: 10 },
        },
      }
      const fakeExtracted = { ...extractor.extract(response), inputCachedWrite: 0 }

      expect(extractor.detectDroppedFields(response, fakeExtracted)).toEqual(['inputCachedWrite'])
    })

    it('returns [outputReasoning] when reasoning_tokens present but extractor zeroed it', () => {
      const response = {
        usage: {
          prompt_tokens: 50,
          completion_tokens: 40,
          completion_tokens_details: { reasoning_tokens: 15 },
        },
      }
      const fakeExtracted = { ...extractor.extract(response), outputReasoning: 0 }

      expect(extractor.detectDroppedFields(response, fakeExtracted)).toEqual(['outputReasoning'])
    })
  })
})
