const axios = require('axios');

class WhatsAppService {
    constructor() {
        this.baseURL = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}`;
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    }

    // Get headers
    getHeaders() {
        return {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
        };
    }

    // Send Text Message
    async sendText(to, message, previewUrl = false) {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "text",
                    text: {
                        preview_url: previewUrl,
                        body: message
                    }
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            console.error('WhatsApp Send Text Error:', error.response?.data || error.message);
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Image
    async sendImage(to, imageUrl, caption = '') {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "image",
                    image: {
                        link: imageUrl,
                        caption: caption
                    }
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            console.error('WhatsApp Send Image Error:', error.response?.data || error.message);
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Video
    async sendVideo(to, videoUrl, caption = '') {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "video",
                    video: {
                        link: videoUrl,
                        caption: caption
                    }
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Document
    async sendDocument(to, documentUrl, filename, caption = '') {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "document",
                    document: {
                        link: documentUrl,
                        filename: filename,
                        caption: caption
                    }
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Audio
    async sendAudio(to, audioUrl) {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "audio",
                    audio: {
                        link: audioUrl
                    }
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Location
    async sendLocation(to, latitude, longitude, name = '', address = '') {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "location",
                    location: {
                        latitude: latitude,
                        longitude: longitude,
                        name: name,
                        address: address
                    }
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Template Message
    async sendTemplate(to, templateName, languageCode = 'en', components = []) {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "template",
                    template: {
                        name: templateName,
                        language: {
                            code: languageCode
                        },
                        components: components
                    }
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            console.error('WhatsApp Send Template Error:', error.response?.data || error.message);
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Interactive Buttons
    async sendButtons(to, bodyText, buttons, headerText = '', footerText = '') {
        try {
            const interactive = {
                type: "button",
                body: { text: bodyText },
                action: {
                    buttons: buttons.map((btn, index) => ({
                        type: "reply",
                        reply: {
                            id: btn.id || `btn_${index}`,
                            title: btn.title.substring(0, 20) // Max 20 chars
                        }
                    }))
                }
            };

            if (headerText) {
                interactive.header = { type: "text", text: headerText };
            }
            if (footerText) {
                interactive.footer = { text: footerText };
            }

            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "interactive",
                    interactive: interactive
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Send Interactive List
    async sendList(to, bodyText, buttonText, sections, headerText = '', footerText = '') {
        try {
            const interactive = {
                type: "list",
                body: { text: bodyText },
                action: {
                    button: buttonText.substring(0, 20),
                    sections: sections
                }
            };

            if (headerText) {
                interactive.header = { type: "text", text: headerText };
            }
            if (footerText) {
                interactive.footer = { text: footerText };
            }

            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: to,
                    type: "interactive",
                    interactive: interactive
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Mark message as read
    async markAsRead(messageId) {
        try {
            const response = await axios.post(
                `${this.baseURL}/${this.phoneNumberId}/messages`,
                {
                    messaging_product: "whatsapp",
                    status: "read",
                    message_id: messageId
                },
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Get Media URL
    async getMediaUrl(mediaId) {
        try {
            const response = await axios.get(
                `${this.baseURL}/${mediaId}`,
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Download Media
    async downloadMedia(mediaUrl) {
        try {
            const response = await axios.get(mediaUrl, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
                responseType: 'arraybuffer'
            });
            return { 
                success: true, 
                data: response.data,
                contentType: response.headers['content-type']
            };
        } catch (error) {
            return { 
                success: false, 
                error: { message: error.message }
            };
        }
    }

    // Get Business Profile
    async getBusinessProfile() {
        try {
            const response = await axios.get(
                `${this.baseURL}/${this.phoneNumberId}/whatsapp_business_profile`,
                { 
                    headers: this.getHeaders(),
                    params: {
                        fields: 'about,address,description,email,profile_picture_url,websites,vertical'
                    }
                }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }

    // Get Message Templates
    async getTemplates(businessId) {
        try {
            const response = await axios.get(
                `${this.baseURL}/${businessId}/message_templates`,
                { headers: this.getHeaders() }
            );
            return { success: true, data: response.data };
        } catch (error) {
            return { 
                success: false, 
                error: error.response?.data?.error || { message: error.message }
            };
        }
    }
}

module.exports = new WhatsAppService();