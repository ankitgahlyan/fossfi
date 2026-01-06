import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    // lang: 'func',
    // targets: ['jetton-minter.fc'],
    lang: 'tolk',
    entrypoint: 'contracts/privateMinter/personal.tolk',
    withSrcLineComments: true,
    withStackComments: true,
};
