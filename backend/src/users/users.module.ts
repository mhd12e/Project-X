import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { GravatarService } from './gravatar.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, GravatarService],
  exports: [UsersService, GravatarService],
})
export class UsersModule {}
