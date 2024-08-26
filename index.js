const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, Events, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
require('dotenv').config();
const fs = require('fs');

const app = express();
const port = 3000;

// Configuración del servidor Express
app.use(cors());
app.use(express.json());

// Inicializa el bot de Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers], // Intent for guild members
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User, Partials.Reaction],
});

client.once(Events.ClientReady, () => {
  console.log(`Bot iniciado como ${client.user.tag}`);
});

// Carga las publicaciones desde el archivo JSON si existe
let publicaciones = [];
try {
  publicaciones = JSON.parse(fs.readFileSync('posts.json', 'utf8'));
} catch (err) {
  // Si el archivo no existe, crea un array vacío
  publicaciones = [];
}

// Mapa para almacenar perfiles de usuario (simplificado)
const perfiles = new Map();

// Guarda las publicaciones en el archivo JSON
function savePosts() {
  fs.writeFileSync('posts.json', JSON.stringify(publicaciones));
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    if (commandName === 'publicar') {
      const mensaje = options.getString('mensaje');
      const imagen = options.getAttachment('imagen');

      // Crear un embed para la publicación
      const embed = new EmbedBuilder()
        .setTitle('Nueva Publicación')
        .setDescription(mensaje)
        .setFooter({ text: 'Reacciones: 0' });

      if (imagen) {
        embed.setImage(imagen.url);
      }

      const row = createButtons();
      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      // Crea un objeto de publicación
      const post = {
        id: msg.id,
        title: mensaje,
        image: imagen ? imagen.url : null,
        likes: [],
        comments: [],
        userId: interaction.user.id,
        userNickname: interaction.user.username, // Almacena el nickname del usuario
      };

      // Agrega la publicación al array
      publicaciones.push(post);
      savePosts(); // Guarda las publicaciones en el archivo

      // Actualiza el perfil del usuario (simplificado)
      const perfil = perfiles.get(interaction.user.id) || {
        nombre: interaction.user.username,
        avatar: interaction.user.avatarURL(),
        posts: [],
      };
      perfil.posts.push(msg.id);
      perfiles.set(interaction.user.id, perfil);
    }
  } else if (interaction.isButton()) {
    const msgId = interaction.message.id;
    const post = publicaciones.find(p => p.id === msgId);

    if (interaction.customId === 'like') {
      const userId = interaction.user.id;

      if (post.likes.includes(userId)) {
        post.likes = post.likes.filter(id => id !== userId);
      } else {
        post.likes.push(userId);
      }

      savePosts(); // Guarda los cambios en el archivo
      await updateEmbed(interaction.message, post);
      await interaction.deferUpdate();
    } else if (interaction.customId === 'comment') {
      const modal = new ModalBuilder()
        .setCustomId('modal-comment')
        .setTitle('Agregar Comentario')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('comment-input')
              .setLabel('Escribe tu comentario')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(90)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal-comment') {
      const comentario = interaction.fields.getTextInputValue('comment-input');
      const msgId = interaction.message.id;
      const post = publicaciones.find(p => p.id === msgId);
      const userId = interaction.user.id;
      const userNickname = interaction.user.username; // Obtén el nickname del usuario

      post.comments.push({ userId, userNickname, comentario });
      savePosts(); // Guarda los comentarios en el archivo

      await updateEmbed(interaction.message, post);
      await interaction.reply({ content: 'Comentario agregado.', ephemeral: true });
    }
  }
});

// Función para crear botones
function createButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('like')
        .setLabel('Me gusta')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👍'),
      new ButtonBuilder()
        .setCustomId('comment')
        .setLabel('Comentar')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('💬')
    );
}

// Función para actualizar el embed
async function updateEmbed(message, post) {
  const embed = EmbedBuilder.from(message.embeds[0]);
  const likesCount = post.likes.length;
  const comments = post.comments.map(c => `<@${c.userId}> (${c.userNickname}): ${c.comentario}`).join('\n');

  embed.setFooter({ text: `Reacciones: ${likesCount}` });
  embed.setFields([{ name: 'Comentarios', value: comments || 'No hay comentarios.', inline: false }]);

  await message.edit({ embeds: [embed] });
}

// API Endpoints
app.get('/posts', (req, res) => {
  res.json(publicaciones);
});

app.get('/profile/:userId', (req, res) => {
  const userId = req.params.userId;
  const perfil = perfiles.get(userId);

  if (perfil) {
    const posts = perfil.posts.map(postId => publicaciones.find(p => p.id === postId));
    res.json({
      nombre: perfil.nombre,
      avatar: perfil.avatar,
      posts,
    });
  } else {
    res.status(404).json({ error: 'Perfil no encontrado' });
  }
});

// Ruta raíz para mostrar publicaciones
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html'); // Send the index.html file
});

// Iniciar el servidor Express
app.listen(port, () => {
  console.log(`Servidor API corriendo en http://localhost:${port}`);
});

// Iniciar el bot de Discord
client.login(process.env.BOT_TOKEN);
