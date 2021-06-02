FROM node

COPY . .

RUN yarn install

CMD ["yarn", "test"]
