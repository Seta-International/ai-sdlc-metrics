import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { JWT_SERVICE } from '../auth/auth.module'
import type { JwtService } from '../auth/jwt.service'
import { initProtectedProcedure } from './trpc-init'

@Module({})
export class TrpcModule implements OnModuleInit {
  constructor(@Inject(JWT_SERVICE) private readonly jwtService: JwtService) {}

  onModuleInit() {
    initProtectedProcedure(this.jwtService)
  }
}
