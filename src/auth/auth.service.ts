import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterUserDto } from 'src/users/dto/user.dto';
import { IUser } from 'src/users/users.interface';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import ms from 'ms';
import { RolesService } from 'src/roles/roles.service';


@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private rolesService: RolesService,
    ) { }

    async validateUser(username: string, pass: string): Promise<any> {
        const user = await this.usersService.findOneByUsername(username);
        if (user) {
            const isValid = this.usersService.isValidPassword(pass, user.password);
            if (isValid === true) {
                const userRole = user.role as unknown as { _id: string, name: string }
                const temp = await this.rolesService.findOne(userRole._id);
                const objUser = {
                    ...user.toObject(),
                    permissions: temp?.permissions ?? []
                }
                console.log("🚀 ~ AuthService ~ validateUser ~ objUser:", objUser);
                return objUser;
            }
        }
        
        return null;
    }


    async login(user: IUser, response: Response) {
        const { _id, name, email, role, permissions } = user;
        const payload = {
            sub: "token login",
            iss: "from server",
            _id,
            name,
            email,
            role,

        };
        const refresh_token = this.createRefreshToken(payload);

        await this.usersService.updateUserToken(refresh_token, _id);

        response.cookie('refresh_token', refresh_token,{
            httpOnly: true,
            maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRE')) ,
        });

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                _id,
                name,
                email,
                role,
                permissions
            }
        };
    }

    async register(user: RegisterUserDto) {
        let newUser = await this.usersService.register(user)
        
        return {
            _id: newUser?._id,
            createAt: newUser?.createdAt
        };
    }

    async create(user: RegisterUserDto) {
        let newUser = await this.usersService.register(user)
        
        return {
            newUser
        };
    }

    createRefreshToken = (payload) => {
        const refeshToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
            expiresIn: ms(this.configService.get<string>("JWT_REFRESH_EXPIRE")) ,
        });
        return refeshToken;
    }

    processNewToken = async (refreshToken: string, response: Response) => {
        try {
            let a = this.jwtService.verify(refreshToken, {
                secret: this.configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
            })
           let user = await this.usersService.findUserByToken(refreshToken);
           if(user){
               const { _id, name, email, role, permissions } = user;
            const payload = {
                sub: "token refresh",
                iss: "from server",
                _id,
                name,
                email,
                role
            };
            const refresh_token = this.createRefreshToken(payload);

               const userRole = user.role as unknown as { _id: string, name: string }
               const temp = await this.rolesService.findOne(userRole._id);

            await this.usersService.updateUserToken(refresh_token, _id.toString());
            response.clearCookie('refresh_token');
            
            response.cookie('refresh_token', refresh_token,{
                httpOnly: true,
                maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRE'))  ,
            });
    
            return {
                access_token: this.jwtService.sign(payload),
                user: {
                    _id,
                    name,
                    email,
                    role,
                    permissions: temp?.permissions ?? []
                }
            };
        
           } else {
            throw new BadRequestException("Refresh token không hợp lệ. Vui lòng login");
           }
           console.log(user);
        } catch (error) {
            throw new BadRequestException("Refresh token không hợp lệ. Vui lòng login");

        }
    }
    logout = async (response: Response, user: IUser) => {
        await this.usersService.updateUserToken(null, user._id);
        response.clearCookie('refresh_token');
        return 'ok'
    }
}
