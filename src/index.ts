import { Client, GuildMember, TextChannel, Guild, CategoryChannel, Message, User, Collection, Snowflake, MessageAttachment } from 'discord.js';
import { load as load_env, load } from '@exan/envreader';
import { Verifying_User } from './classes/verifying_user';
import { readFileSync, writeFileSync } from 'fs';

load_env();

let client = new Client;

let log_channel: TextChannel;
let category_channel: CategoryChannel;
let guild: Guild;
let verification_role_ids: Array<string> = process.env.VERIFIED_ROLES.split(',');

let verifying_users: {[user_id: string]: Verifying_User} = {};

let message = readFileSync('.message').toString();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    guild = client.guilds.resolve(process.env.GUILD_ID);

    log_channel = guild.channels.resolve(process.env.LOG_CHANNEL) as TextChannel;

    category_channel = guild.channels.resolve(process.env.CATEGORY_ID) as CategoryChannel;
});

client.on('guildMemberAdd', async (member: GuildMember) => {
    /**
     * Ignore bots
     */
    if (member.user.bot)
        return;

    /**
     * Bot should only function in the guild specified in .env
     */
    if (member.guild.id !== guild.id)
        return;

    let verifying_user = verifying_users[member.id] = {
        channel: await guild.channels.create('Verification', {
            topic: `Verification for user ${member.displayName}`,
            type: 'text',
            parent: category_channel,
            permissionOverwrites: category_channel.permissionOverwrites.array()
        }),
        member: member,
    };

    verifying_user.channel.updateOverwrite(member.id, {
        READ_MESSAGE_HISTORY: true,
        SEND_MESSAGES: true,
        VIEW_CHANNEL: true
    });

    verifying_user.channel.send((message.replace(/:username/g, member.displayName)).replace(/:user_id/g, member.id));
});

client.on('guildMemberRemove', async (member: GuildMember) => {
    verification_ended(member.user);
});

client.on('guildBanAdd', (guild: Guild, user: User) => {
    verification_ended(user)
});

client.on('guildMemberUpdate', (old_member: GuildMember, new_member: GuildMember) => {
    /**
     * If one of the verification roles was added to the user
     */
    if (!(old_member.roles.cache.find(r => verification_role_ids.includes(r.id)))
            && (Boolean) (new_member.roles.cache.find(r => verification_role_ids.includes(r.id)))) {
        verification_ended(new_member.user)
    }
});

async function verification_ended(user: User) {
    if (!verifying_users[user.id])
        return;

    let messages = ((await verifying_users[user.id].channel.messages.fetch({limit: 50})) as Collection<Snowflake, Message>).array().reverse();

    let log = `Verification log for user ${verifying_users[user.id].member.displayName}\n\n`;

    messages.forEach((message) => {
        log += `${message.member ? message.member.displayName : 'No Nickname Available'} - ${message.author.username} - ${message.author.id}\n\t${(message.cleanContent.replace(/\n/g, '\n\t') || 'No message')}\n`

        if (message.attachments.size > 0) {
            message.attachments.forEach((attachment) => {
                log += `\tAttachment: ${attachment.url}\n`
            });
        }

        log += '\n';
    });

    let file_name = `./logs/${user.id}`;

    writeFileSync(file_name, log);

    log_channel.send(user.id, new MessageAttachment(file_name, `verification-${user.id}.log`));

    verifying_users[user.id].channel.delete().catch((e) => { });
    delete verifying_users[user.id];
}

client.login(process.env.BOT_TOKEN);