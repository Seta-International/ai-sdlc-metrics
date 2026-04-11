import { Module, Global } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from './jwt.service'

export const JWT_SERVICE = Symbol('JwtService')

@Global()
@Module({
  providers: [
    {
      provide: JWT_SERVICE,
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET')
        return new JwtService(secret)
      },
      inject: [ConfigService],
    },
  ],
  exports: [JWT_SERVICE],
})
export class AuthModule {}
