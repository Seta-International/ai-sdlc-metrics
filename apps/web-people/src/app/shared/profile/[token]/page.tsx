'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Card, Badge, Skeleton } from '@future/ui'
import { trpc } from '../../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

type SharedProfile = {
  fullName: string
  avatarUrl: string | null
  jobTitle: string
  department: string
  companyName: string
  companyEmail: string
  workArrangement: string | null
  location: string | null
  skills: string[]
  education: Array<{ institution: string; degree: string; year: string }>
  certifications: Array<{ name: string; issuer: string; year: string }>
  socialLinks: Array<{ platform: string; url: string }>
  expiresAt: string | null
}

export default function SharedProfilePage() {
  const params = useParams()
  const token = params.token as string
  const [profile, setProfile] = React.useState<SharedProfile | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.sharedProfile.get.query({ token }) as Promise<{
          profile: SharedProfile
        }>)
        setProfile(result.profile)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Invalid or expired link')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [token])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-lg" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8 text-center max-w-md">
          <p className="text-sm text-[#8a8f98]">{error ?? 'Profile not found'}</p>
        </Card>
      </div>
    )
  }

  const initials = profile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4">
      <div className="text-sm font-[510] text-[#8a8f98] mb-8">{profile.companyName}</div>
      <Card className="w-full max-w-lg border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(255,255,255,0.05)] text-xl font-[510] text-[#d0d6e0] mb-4">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <h1 className="text-2xl font-[510] tracking-[-0.288px] text-[#f7f8f8]">
            {profile.fullName}
          </h1>
          <div className="text-sm text-[#8a8f98] mt-1">{profile.jobTitle}</div>
          <div className="text-sm text-[#62666d]">{profile.department}</div>
        </div>

        <div className="space-y-2 mb-6">
          <div className="text-xs text-[#62666d] uppercase font-[510]">Contact</div>
          <div className="text-sm text-[#d0d6e0]">{profile.companyEmail}</div>
          {profile.location && <div className="text-sm text-[#8a8f98]">{profile.location}</div>}
          {profile.workArrangement && (
            <Badge variant="subtle">{profile.workArrangement.replace('_', ' ')}</Badge>
          )}
        </div>

        {profile.skills.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Skills</div>
            <div className="flex flex-wrap gap-1">
              {profile.skills.map((skill) => (
                <Badge key={skill} variant="subtle">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {profile.education.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Education</div>
            {profile.education.map((edu, i) => (
              <div key={i} className="mb-2">
                <div className="text-sm text-[#d0d6e0]">{edu.degree}</div>
                <div className="text-xs text-[#8a8f98]">
                  {edu.institution}, {edu.year}
                </div>
              </div>
            ))}
          </div>
        )}

        {profile.certifications.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Certifications</div>
            {profile.certifications.map((cert, i) => (
              <div key={i} className="mb-2">
                <div className="text-sm text-[#d0d6e0]">{cert.name}</div>
                <div className="text-xs text-[#8a8f98]">
                  {cert.issuer}, {cert.year}
                </div>
              </div>
            ))}
          </div>
        )}

        {profile.socialLinks.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[#62666d] uppercase font-[510] mb-2">Links</div>
            {profile.socialLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-[#7170ff] hover:text-[#828fff] mb-1"
              >
                {link.platform}
              </a>
            ))}
          </div>
        )}

        {profile.expiresAt &&
          (() => {
            const daysLeft = Math.ceil(
              (new Date(profile.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )
            if (daysLeft <= 7)
              return (
                <div className="text-xs text-amber-400 text-center mt-4">
                  This profile link expires in {daysLeft} day(s).
                </div>
              )
            return null
          })()}
      </Card>
      <div className="mt-6 text-xs text-[#62666d]">
        This profile was shared by {profile.companyName}
      </div>
    </div>
  )
}
