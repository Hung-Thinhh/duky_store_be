import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AssignAdminUserRolesDto } from './dto/assign-admin-user-roles.dto';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UsersService } from './users.service';

@ApiTags('Admin Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List admin users' })
  list(@Query() query: ListAdminUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Get('roles')
  @ApiOperation({ summary: 'List assignable admin roles' })
  listRoles() {
    return this.usersService.listRoles();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get admin user detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.usersService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update admin user profile' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateAdminUserDto) {
    return this.usersService.update(id, updateDto);
  }

  @Patch(':id/lock')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Lock admin user and revoke active refresh tokens' })
  @ApiParam({ name: 'id' })
  lock(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.lock(id, user.id);
  }

  @Patch(':id/unlock')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Unlock admin user' })
  @ApiParam({ name: 'id' })
  unlock(@Param('id') id: string) {
    return this.usersService.unlock(id);
  }

  @Patch(':id/roles')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Assign roles to admin user' })
  @ApiParam({ name: 'id' })
  assignRoles(
    @Param('id') id: string,
    @Body() assignRolesDto: AssignAdminUserRolesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.assignRoles(id, assignRolesDto, user.id);
  }
}
